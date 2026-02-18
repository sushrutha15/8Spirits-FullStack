class CacheService {
  constructor() {
    this.localCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  /**
   * Multi-layer cache (Memory + Redis fallback)
   */
  async get(key) {
    // Layer 1: Local memory cache
    if (this.localCache.has(key)) {
      const cached = this.localCache.get(key);
      if (cached.expiresAt > Date.now()) {
        this.cacheStats.hits++;
        console.log(`🎯 Cache HIT (memory): ${key}`);
        return cached.value;
      } else {
        this.localCache.delete(key);
      }
    }

    // Layer 2: Redis cache (if available)
    const redis = this.getRedisClient();
    if (redis) {
      try {
        const value = await redis.get(key);
        if (value) {
          this.cacheStats.hits++;
          console.log(`🎯 Cache HIT (redis): ${key}`);
          
          // Populate local cache
          this.localCache.set(key, {
            value: JSON.parse(value),
            expiresAt: Date.now() + 60000 // 1 minute in memory
          });
          
          return JSON.parse(value);
        }
      } catch (error) {
        console.error('Redis get error:', error.message);
      }
    }

    this.cacheStats.misses++;
    console.log(`❌ Cache MISS: ${key}`);
    return null;
  }

  /**
   * Set cache in both layers
   */
  async set(key, value, ttl = 3600) {
    this.cacheStats.sets++;

    // Layer 1: Memory cache
    this.localCache.set(key, {
      value,
      expiresAt: Date.now() + Math.min(ttl * 1000, 300000) // Max 5 min in memory
    });

    // Layer 2: Redis cache
    const redis = this.getRedisClient();
    if (redis) {
      try {
        await redis.setex(key, ttl, JSON.stringify(value));
        console.log(`💾 Cached: ${key} (TTL: ${ttl}s)`);
      } catch (error) {
        console.error('Redis set error:', error.message);
      }
    }

    return true;
  }

  /**
   * Delete from cache
   */
  async delete(key) {
    this.localCache.delete(key);

    const redis = this.getRedisClient();
    if (redis) {
      try {
        await redis.del(key);
      } catch (error) {
        console.error('Redis delete error:', error.message);
      }
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    this.localCache.clear();

    const redis = this.getRedisClient();
    if (redis) {
      try {
        await redis.flushdb();
      } catch (error) {
        console.error('Redis flush error:', error.message);
      }
    }
  }

  /**
   * Cache with function execution
   */
  async remember(key, ttl, fn) {
    const cached = await this.get(key);
    
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, ttl);
    
    return value;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0
      ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.cacheStats,
      hitRate: `${hitRate}%`,
      memoryKeys: this.localCache.size
    };
  }

  getRedisClient() {
    try {
      const app = require('../app');
      return app.get('redis');
    } catch {
      return null;
    }
  }
}

module.exports = new CacheService();