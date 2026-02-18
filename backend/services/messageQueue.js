const EventEmitter = require('events');

class MessageQueue extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
    this.deadLetterQueue = [];
    this.retryPolicy = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2
    };
  }

  /**
   * Publish event to queue
   */
  async publish(topic, event, options = {}) {
    const message = {
      id: this.generateMessageId(),
      topic,
      event,
      data: event.data,
      timestamp: Date.now(),
      priority: options.priority || 'normal',
      retries: 0,
      correlationId: options.correlationId || this.generateCorrelationId(),
      headers: options.headers || {}
    };

    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }

    const queue = this.queues.get(topic);
    
    // Priority queue insertion
    if (options.priority === 'high') {
      queue.unshift(message);
    } else {
      queue.push(message);
    }

    this.emit(topic, message);
    
    console.log(`📤 Published to ${topic}:`, event.type);
    
    return message.id;
  }

  /**
   * Subscribe to topic
   */
  subscribe(topic, handler) {
    this.on(topic, async (message) => {
      try {
        await handler(message);
        console.log(`✓ Processed: ${topic} - ${message.event.type}`);
      } catch (error) {
        console.error(`✗ Error processing ${topic}:`, error);
        await this.handleFailure(topic, message, error);
      }
    });

    console.log(`✓ Subscribed to ${topic}`);
  }

  /**
   * Handle message failure with retry logic
   */
  async handleFailure(topic, message, error) {
    message.retries++;
    message.lastError = error.message;

    if (message.retries < this.retryPolicy.maxRetries) {
      const delay = this.retryPolicy.retryDelay * 
        Math.pow(this.retryPolicy.backoffMultiplier, message.retries - 1);
      
      console.log(`⏱️  Retrying ${topic} in ${delay}ms (attempt ${message.retries})`);
      
      setTimeout(() => {
        this.emit(topic, message);
      }, delay);
    } else {
      console.error(`☠️  Moving to dead letter queue: ${topic}`);
      this.deadLetterQueue.push({ topic, message, error: error.message });
    }
  }

  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCorrelationId() {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getDeadLetterQueue() {
    return this.deadLetterQueue;
  }

  clearDeadLetterQueue() {
    this.deadLetterQueue = [];
  }
}

// Singleton instance
const messageQueue = new MessageQueue();

// Event types
const Events = {
  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',
  
  USER_REGISTERED: 'user.registered',
  USER_VERIFIED: 'user.verified',
  USER_PASSWORD_RESET: 'user.password_reset',
  
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_OUT_OF_STOCK: 'product.out_of_stock',
  PRODUCT_BACK_IN_STOCK: 'product.back_in_stock',
  
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  
  INVENTORY_LOW: 'inventory.low',
  INVENTORY_UPDATED: 'inventory.updated',
  
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  
  REVIEW_SUBMITTED: 'review.submitted',
  REVIEW_APPROVED: 'review.approved',
  
  FRAUD_DETECTED: 'fraud.detected',
  SUSPICIOUS_ACTIVITY: 'suspicious.activity'
};

module.exports = { messageQueue, Events };