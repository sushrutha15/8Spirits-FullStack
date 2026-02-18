const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  storeNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Location
  address: {
    address1: { type: String, required: true },
    address2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, default: 'USA' }
  },
  
  // Geolocation
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },

  // Contact Information
  phone: {
    type: String,
    required: true
  },
  email: String,
  website: String,

  // Operating Hours
  hours: {
    monday: {
      open: String,
      close: String,
      closed: Boolean
    },
    tuesday: {
      open: String,
      close: String,
      closed: Boolean
    },
    wednesday: {
      open: String,
      close: String,
      closed: Boolean
    },
    thursday: {
      open: String,
      close: String,
      closed: Boolean
    },
    friday: {
      open: String,
      close: String,
      closed: Boolean
    },
    saturday: {
      open: String,
      close: String,
      closed: Boolean
    },
    sunday: {
      open: String,
      close: String,
      closed: Boolean
    }
  },

  // Special Hours
  specialHours: [{
    date: Date,
    open: String,
    close: String,
    closed: Boolean,
    reason: String
  }],

  // Services & Features
  features: [{
    type: String,
    enum: [
      'wine_tasting',
      'gift_wrapping',
      'delivery',
      'curbside_pickup',
      'in_store_pickup',
      'gift_cards',
      'wine_classes',
      'private_events',
      'consultation',
      'loyalty_program',
      'wheelchair_accessible',
      'parking_available',
      'climate_controlled',
      'rare_collection'
    ]
  }],

  // Staff
  manager: {
    name: String,
    phone: String,
    email: String
  },
  staff: [{
    name: String,
    role: String,
    phone: String,
    email: String
  }],

  // Inventory
  inventoryCount: {
    type: Number,
    default: 0
  },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],

  // Store Details
  storeSize: Number, // square feet
  stockRoomSize: Number,
  parkingSpaces: Number,
  
  // Images
  images: [{
    url: String,
    alt: String,
    isPrimary: Boolean
  }],
  logo: String,

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  temporarilyClosed: Boolean,
  closureReason: String,
  reopeningDate: Date,

  // Ratings
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },

  // Events
  upcomingEvents: [{
    name: String,
    description: String,
    date: Date,
    startTime: String,
    endTime: String,
    capacity: Number,
    registered: { type: Number, default: 0 },
    price: Number,
    image: String
  }],

  // Analytics
  totalOrders: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  customerCount: {
    type: Number,
    default: 0
  },

  // Delivery Zones
  deliveryZones: [{
    zipCode: String,
    deliveryFee: Number,
    minimumOrder: Number,
    estimatedTime: String
  }],

  // Metadata
  tags: [String],
  notes: String,
  metadata: mongoose.Schema.Types.Mixed

}, {
  timestamps: true
});

// Geospatial index for location-based queries
storeSchema.index({ location: '2dsphere' });
storeSchema.index({ 'address.zipCode': 1 });
storeSchema.index({ isActive: 1 });

// Check if store is open now
storeSchema.methods.isOpenNow = function() {
  const now = new Date();
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // Check special hours first
  const todaySpecial = this.specialHours.find(sh => {
    const specialDate = new Date(sh.date);
    return specialDate.toDateString() === now.toDateString();
  });

  if (todaySpecial) {
    if (todaySpecial.closed) return false;
    return currentTime >= todaySpecial.open && currentTime <= todaySpecial.close;
  }

  // Check regular hours
  const todayHours = this.hours[dayName];
  if (!todayHours || todayHours.closed) return false;

  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};

// Get distance from coordinates
storeSchema.methods.getDistanceFrom = function(longitude, latitude) {
  const [storeLng, storeLat] = this.location.coordinates;
  
  // Haversine formula
  const R = 3959; // Earth's radius in miles
  const dLat = (storeLat - latitude) * Math.PI / 180;
  const dLon = (storeLng - longitude) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(latitude * Math.PI / 180) * Math.cos(storeLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal
};

// Static method to find nearby stores
storeSchema.statics.findNearby = async function(longitude, latitude, maxDistance = 50) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance * 1609.34 // Convert miles to meters
      }
    },
    isActive: true
  });
};

module.exports = mongoose.model('Store', storeSchema);