class InternationalizationService {
  constructor() {
    this.currencies = new Map();
    this.exchangeRates = new Map();
    this.languages = new Map();
    this.translations = new Map();
    this.locales = new Map();
    
    this.initializeCurrencies();
    this.initializeLanguages();
  }

  /**
   * Initialize supported currencies
   */
  initializeCurrencies() {
    const currencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
      { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
      { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
      { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', decimals: 2 }
    ];

    currencies.forEach(currency => {
      this.currencies.set(currency.code, currency);
    });

    // Mock exchange rates (base: USD)
    this.updateExchangeRates({
      USD: 1.00,
      EUR: 0.85,
      GBP: 0.73,
      JPY: 110.50,
      CAD: 1.25,
      AUD: 1.35,
      CHF: 0.92,
      CNY: 6.45,
      INR: 74.50,
      MXN: 20.15
    });
  }

  /**
   * Initialize supported languages
   */
  initializeLanguages() {
    const languages = [
      { code: 'en', name: 'English', nativeName: 'English', rtl: false },
      { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false },
      { code: 'fr', name: 'French', nativeName: 'Français', rtl: false },
      { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false },
      { code: 'it', name: 'Italian', nativeName: 'Italiano', rtl: false },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false },
      { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false },
      { code: 'zh', name: 'Chinese', nativeName: '中文', rtl: false },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false }
    ];

    languages.forEach(lang => {
      this.languages.set(lang.code, lang);
    });

    // Load default translations
    this.loadTranslations();
  }

  /**
   * Load translation strings
   */
  loadTranslations() {
    // Sample translations
    const translations = {
      en: {
        'app.name': '8 Spirits',
        'common.add_to_cart': 'Add to Cart',
        'common.checkout': 'Checkout',
        'common.price': 'Price',
        'common.quantity': 'Quantity',
        'common.total': 'Total',
        'product.out_of_stock': 'Out of Stock',
        'product.in_stock': 'In Stock',
        'order.placed': 'Order Placed',
        'order.shipped': 'Shipped',
        'order.delivered': 'Delivered'
      },
      es: {
        'app.name': '8 Spirits',
        'common.add_to_cart': 'Añadir al Carrito',
        'common.checkout': 'Pagar',
        'common.price': 'Precio',
        'common.quantity': 'Cantidad',
        'common.total': 'Total',
        'product.out_of_stock': 'Agotado',
        'product.in_stock': 'En Stock',
        'order.placed': 'Pedido Realizado',
        'order.shipped': 'Enviado',
        'order.delivered': 'Entregado'
      },
      fr: {
        'app.name': '8 Spirits',
        'common.add_to_cart': 'Ajouter au Panier',
        'common.checkout': 'Commander',
        'common.price': 'Prix',
        'common.quantity': 'Quantité',
        'common.total': 'Total',
        'product.out_of_stock': 'Rupture de Stock',
        'product.in_stock': 'En Stock',
        'order.placed': 'Commande Passée',
        'order.shipped': 'Expédié',
        'order.delivered': 'Livré'
      },
      de: {
        'app.name': '8 Spirits',
        'common.add_to_cart': 'In den Warenkorb',
        'common.checkout': 'Zur Kasse',
        'common.price': 'Preis',
        'common.quantity': 'Menge',
        'common.total': 'Gesamt',
        'product.out_of_stock': 'Ausverkauft',
        'product.in_stock': 'Auf Lager',
        'order.placed': 'Bestellung Aufgegeben',
        'order.shipped': 'Versendet',
        'order.delivered': 'Geliefert'
      }
    };

    Object.entries(translations).forEach(([lang, strings]) => {
      this.translations.set(lang, strings);
    });
  }

  /**
   * Convert price between currencies
   */
  convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const fromRate = this.exchangeRates.get(fromCurrency) || 1;
    const toRate = this.exchangeRates.get(toCurrency) || 1;

    // Convert to USD first, then to target currency
    const usdAmount = amount / fromRate;
    const converted = usdAmount * toRate;

    return this.roundToDecimals(converted, this.getCurrencyDecimals(toCurrency));
  }

  /**
   * Format price with currency
   */
  formatPrice(amount, currency, locale = 'en-US') {
    const currencyInfo = this.currencies.get(currency);
    
    if (!currencyInfo) {
      return `${currency} ${amount.toFixed(2)}`;
    }

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: currencyInfo.decimals,
        maximumFractionDigits: currencyInfo.decimals
      }).format(amount);
    } catch (error) {
      return `${currencyInfo.symbol}${amount.toFixed(currencyInfo.decimals)}`;
    }
  }

  /**
   * Get translated string
   */
  translate(key, language = 'en', params = {}) {
    const langStrings = this.translations.get(language) || this.translations.get('en');
    let translation = langStrings[key] || key;

    // Replace parameters {param}
    Object.entries(params).forEach(([param, value]) => {
      translation = translation.replace(`{${param}}`, value);
    });

    return translation;
  }

  /**
   * Translate multiple keys
   */
  translateMany(keys, language = 'en') {
    const result = {};
    keys.forEach(key => {
      result[key] = this.translate(key, language);
    });
    return result;
  }

  /**
   * Get localized product data
   */
  async localizeProduct(product, language, currency) {
    const localized = {
      ...product.toObject(),
      language,
      currency
    };

    // Translate fields
    if (product.name) {
      localized.name = this.translateProductField(product._id, 'name', language) || product.name;
    }

    if (product.description) {
      localized.description = this.translateProductField(product._id, 'description', language) || product.description;
    }

    // Convert price
    if (product.price) {
      localized.originalPrice = product.price;
      localized.originalCurrency = 'USD';
      localized.price = this.convertCurrency(product.price, 'USD', currency);
      localized.formattedPrice = this.formatPrice(localized.price, currency);
    }

    return localized;
  }

  /**
   * Mock product field translation
   */
  translateProductField(productId, field, language) {
    // In production: fetch from database translation table
    // For now: return null to use original
    return null;
  }

  /**
   * Get user's locale from request
   */
  detectLocale(req) {
    // Priority: 1. Query param, 2. Cookie, 3. Header, 4. Default
    const locale = 
      req.query.locale ||
      req.cookies?.locale ||
      req.headers['accept-language']?.split(',')[0] ||
      'en-US';

    return this.parseLocale(locale);
  }

  /**
   * Parse locale string
   */
  parseLocale(localeString) {
    const [language, country] = localeString.split('-');
    
    return {
      full: localeString,
      language: language.toLowerCase(),
      country: country?.toUpperCase(),
      isRTL: this.languages.get(language)?.rtl || false
    };
  }

  /**
   * Get currency from locale
   */
  getCurrencyFromLocale(locale) {
    const currencyMap = {
      'US': 'USD',
      'GB': 'GBP',
      'EU': 'EUR',
      'FR': 'EUR',
      'DE': 'EUR',
      'IT': 'EUR',
      'ES': 'EUR',
      'JP': 'JPY',
      'CA': 'CAD',
      'AU': 'AUD',
      'CH': 'CHF',
      'CN': 'CNY',
      'IN': 'INR',
      'MX': 'MXN'
    };

    return currencyMap[locale.country] || 'USD';
  }

  /**
   * Update exchange rates (fetch from API in production)
   */
  updateExchangeRates(rates) {
    Object.entries(rates).forEach(([currency, rate]) => {
      this.exchangeRates.set(currency, rate);
    });

    console.log(`💱 Updated exchange rates for ${Object.keys(rates).length} currencies`);
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies() {
    return Array.from(this.currencies.values());
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages() {
    return Array.from(this.languages.values());
  }

  /**
   * Get currency decimals
   */
  getCurrencyDecimals(currency) {
    return this.currencies.get(currency)?.decimals || 2;
  }

  /**
   * Round to currency decimals
   */
  roundToDecimals(amount, decimals) {
    return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Format date for locale
   */
  formatDate(date, locale = 'en-US') {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }

  /**
   * Format number for locale
   */
  formatNumber(number, locale = 'en-US') {
    return new Intl.NumberFormat(locale).format(number);
  }

  /**
   * Get tax rate for country
   */
  getTaxRate(countryCode) {
    const taxRates = {
      'US': 0.08,
      'GB': 0.20, // VAT
      'FR': 0.20,
      'DE': 0.19,
      'IT': 0.22,
      'ES': 0.21,
      'CA': 0.13,
      'AU': 0.10, // GST
      'JP': 0.10,
      'IN': 0.18  // GST
    };

    return taxRates[countryCode] || 0;
  }

  /**
   * Localize entire order
   */
  async localizeOrder(order, language, currency) {
    const localized = {
      ...order.toObject(),
      language,
      currency
    };

    // Convert all prices
    localized.subtotal = this.convertCurrency(order.subtotal, 'USD', currency);
    localized.tax = this.convertCurrency(order.tax, 'USD', currency);
    localized.shippingCost = this.convertCurrency(order.shippingCost, 'USD', currency);
    localized.total = this.convertCurrency(order.total, 'USD', currency);

    // Format prices
    localized.formattedSubtotal = this.formatPrice(localized.subtotal, currency);
    localized.formattedTax = this.formatPrice(localized.tax, currency);
    localized.formattedShipping = this.formatPrice(localized.shippingCost, currency);
    localized.formattedTotal = this.formatPrice(localized.total, currency);

    // Translate status
    localized.statusTranslated = this.translate(`order.${order.orderStatus}`, language);

    return localized;
  }
}

module.exports = new InternationalizationService();