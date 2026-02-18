const EventEmitter = require('events');

class InventorySyncService extends EventEmitter {
  constructor() {
    super();
    this.warehouses = new Map();
    this.syncQueue = [];
    this.conflicts = [];
    this.syncInProgress = false;
  }

  /**
   * Initialize warehouse nodes
   */
  registerWarehouse(warehouseId, location) {
    this.warehouses.set(warehouseId, {
      id: warehouseId,
      location,
      inventory: new Map(),
      lastSync: null,
      status: 'active',
      lag: 0
    });

    console.log(`🏭 Registered warehouse: ${warehouseId} (${location})`);
  }

  /**
   * Update inventory with conflict resolution
   */
  async updateInventory(warehouseId, productId, quantity, operation = 'set') {
    const warehouse = this.warehouses.get(warehouseId);
    
    if (!warehouse) {
      throw new Error(`Warehouse ${warehouseId} not found`);
    }

    const update = {
      id: this.generateUpdateId(),
      warehouseId,
      productId,
      quantity,
      operation, // 'set', 'add', 'subtract', 'reserve', 'release'
      timestamp: Date.now(),
      version: this.getVersion(warehouseId, productId) + 1
    };

    // Add to sync queue
    this.syncQueue.push(update);

    // Apply update locally
    await this.applyUpdate(warehouse, update);

    // Propagate to other warehouses
    await this.propagateUpdate(update);

    // Emit event
    this.emit('inventory:updated', update);

    return update;
  }

  /**
   * Apply inventory update
   */
  async applyUpdate(warehouse, update) {
    const current = warehouse.inventory.get(update.productId) || {
      quantity: 0,
      reserved: 0,
      version: 0
    };

    let newQuantity = current.quantity;

    switch (update.operation) {
      case 'set':
        newQuantity = update.quantity;
        break;
      case 'add':
        newQuantity += update.quantity;
        break;
      case 'subtract':
        newQuantity = Math.max(0, newQuantity - update.quantity);
        break;
      case 'reserve':
        if (newQuantity >= update.quantity) {
          current.reserved += update.quantity;
        } else {
          throw new Error(`Insufficient inventory to reserve ${update.quantity}`);
        }
        break;
      case 'release':
        current.reserved = Math.max(0, current.reserved - update.quantity);
        break;
    }

    warehouse.inventory.set(update.productId, {
      quantity: newQuantity,
      reserved: current.reserved,
      version: update.version,
      lastUpdated: update.timestamp
    });

    console.log(`📦 ${warehouse.id}: ${update.productId} = ${newQuantity} (v${update.version})`);
  }

  /**
   * Propagate update to other warehouses
   */
  async propagateUpdate(update) {
    const promises = [];

    for (const [warehouseId, warehouse] of this.warehouses) {
      if (warehouseId !== update.warehouseId && warehouse.status === 'active') {
        promises.push(this.syncToWarehouse(warehouse, update));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Sync update to specific warehouse
   */
  async syncToWarehouse(warehouse, update) {
    try {
      const current = warehouse.inventory.get(update.productId);

      // Check for conflicts (concurrent updates)
      if (current && current.version >= update.version) {
        await this.handleConflict(warehouse, update, current);
        return;
      }

      // Apply update
      await this.applyUpdate(warehouse, update);
      warehouse.lastSync = Date.now();

    } catch (error) {
      console.error(`✗ Sync failed to ${warehouse.id}:`, error.message);
      warehouse.lag++;
    }
  }

  /**
   * Handle inventory conflicts (Last-Write-Wins strategy)
   */
  async handleConflict(warehouse, update, current) {
    const conflict = {
      id: this.generateConflictId(),
      warehouseId: warehouse.id,
      productId: update.productId,
      incomingUpdate: update,
      currentState: current,
      timestamp: Date.now(),
      resolved: false
    };

    this.conflicts.push(conflict);

    // Use Last-Write-Wins strategy
    if (update.timestamp > current.lastUpdated) {
      await this.applyUpdate(warehouse, update);
      conflict.resolved = true;
      conflict.resolution = 'accepted_incoming';
      console.log(`⚠️  Conflict resolved: Accepted newer update for ${update.productId}`);
    } else {
      conflict.resolved = true;
      conflict.resolution = 'kept_current';
      console.log(`⚠️  Conflict resolved: Kept current state for ${update.productId}`);
    }

    this.emit('inventory:conflict', conflict);
  }

  /**
   * Get aggregated inventory across all warehouses
   */
  getGlobalInventory(productId) {
    let totalQuantity = 0;
    let totalReserved = 0;
    const warehouses = [];

    for (const [warehouseId, warehouse] of this.warehouses) {
      const inventory = warehouse.inventory.get(productId);
      
      if (inventory) {
        totalQuantity += inventory.quantity;
        totalReserved += inventory.reserved;
        
        warehouses.push({
          warehouseId,
          location: warehouse.location,
          quantity: inventory.quantity,
          reserved: inventory.reserved,
          available: inventory.quantity - inventory.reserved
        });
      }
    }

    return {
      productId,
      totalQuantity,
      totalReserved,
      totalAvailable: totalQuantity - totalReserved,
      warehouses,
      lastUpdated: Date.now()
    };
  }

  /**
   * Find optimal warehouse for order fulfillment
   */
  findOptimalWarehouse(productId, quantity, shippingAddress) {
    const candidates = [];

    for (const [warehouseId, warehouse] of this.warehouses) {
      const inventory = warehouse.inventory.get(productId);
      
      if (inventory && (inventory.quantity - inventory.reserved) >= quantity) {
        const distance = this.calculateDistance(
          warehouse.location,
          shippingAddress
        );

        candidates.push({
          warehouseId,
          location: warehouse.location,
          available: inventory.quantity - inventory.reserved,
          distance,
          estimatedShipping: this.estimateShipping(distance)
        });
      }
    }

    // Sort by distance (closest first)
    candidates.sort((a, b) => a.distance - b.distance);

    return candidates[0] || null;
  }

  /**
   * Reserve inventory for order
   */
  async reserveInventory(warehouseId, productId, quantity) {
    return await this.updateInventory(warehouseId, productId, quantity, 'reserve');
  }

  /**
   * Release reserved inventory
   */
  async releaseInventory(warehouseId, productId, quantity) {
    return await this.updateInventory(warehouseId, productId, quantity, 'release');
  }

  /**
   * Commit reserved inventory (convert to actual sale)
   */
  async commitReservation(warehouseId, productId, quantity) {
    // Release reservation and subtract from inventory
    await this.releaseInventory(warehouseId, productId, quantity);
    await this.updateInventory(warehouseId, productId, quantity, 'subtract');
  }

  /**
   * Sync inventory from external source (ERP, WMS)
   */
  async syncFromExternalSystem(warehouseId, inventoryData) {
    const warehouse = this.warehouses.get(warehouseId);
    
    if (!warehouse) {
      throw new Error(`Warehouse ${warehouseId} not found`);
    }

    const updates = [];

    for (const item of inventoryData) {
      const update = await this.updateInventory(
        warehouseId,
        item.productId,
        item.quantity,
        'set'
      );
      updates.push(update);
    }

    console.log(`✓ Synced ${updates.length} items from external system to ${warehouseId}`);
    return updates;
  }

  /**
   * Get sync status and health
   */
  getSyncStatus() {
    const warehouseStatus = [];
    let totalLag = 0;

    for (const [warehouseId, warehouse] of this.warehouses) {
      const lag = warehouse.lag || 0;
      totalLag += lag;

      warehouseStatus.push({
        warehouseId,
        location: warehouse.location,
        status: warehouse.status,
        itemCount: warehouse.inventory.size,
        lastSync: warehouse.lastSync,
        lag,
        healthy: lag < 10
      });
    }

    return {
      warehouses: warehouseStatus,
      totalWarehouses: this.warehouses.size,
      activeWarehouses: warehouseStatus.filter(w => w.status === 'active').length,
      queueLength: this.syncQueue.length,
      conflicts: this.conflicts.length,
      unresolvedConflicts: this.conflicts.filter(c => !c.resolved).length,
      avgLag: totalLag / this.warehouses.size,
      healthy: totalLag / this.warehouses.size < 5
    };
  }

  /**
   * Calculate distance between two locations (simplified)
   */
  calculateDistance(location1, location2) {
    // Simplified: return random distance for demo
    // In production: use Haversine formula or Google Distance Matrix API
    return Math.floor(Math.random() * 1000) + 50;
  }

  /**
   * Estimate shipping time based on distance
   */
  estimateShipping(distance) {
    if (distance < 100) return '1-2 days';
    if (distance < 500) return '2-3 days';
    if (distance < 1000) return '3-5 days';
    return '5-7 days';
  }

  getVersion(warehouseId, productId) {
    const warehouse = this.warehouses.get(warehouseId);
    if (!warehouse) return 0;
    
    const inventory = warehouse.inventory.get(productId);
    return inventory ? inventory.version : 0;
  }

  generateUpdateId() {
    return `upd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateConflictId() {
    return `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = new InventorySyncService();