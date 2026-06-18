const KEYWORD_MAP: Record<string, string[]> = {
  billing: [
    'factura', 'invoice', 'pago', 'payment', 'precio', 'price',
    'costo', 'cost', 'dinero', 'money', 'tarjeta', 'card',
    'transacci\u00f3n', 'transaction', 'cobro', 'charge', 'saldo', 'balance',
    'pagar', 'pay', 'adeudo', 'deuda', 'debit', 'cr\u00e9dito', 'credit',
    'cu\u00e1nto cuesta', 'how much', 'vale', 'worth',
  ],
  support: [
    'error', 'problema', 'problem', 'bug', 'no funciona', 'not working',
    'ayuda', 'help', 'soporte', 'support', 'falla', 'broken',
    'crash', 'issue', 'no me', 'cannot', 'no puedo', "don't work",
    'emergency', 'urgente', 'urgent', 'help me', 'necesito ayuda',
    'roto', 'damaged', "doesn't work", 'not', 'no', '\u{1f62d}', '\u{1f622}',
    'bad', 'terrible', 'peor',
  ],
  product: [
    'producto', 'product', 'cat\u00e1logo', 'catalog', 'item',
    'feature', 'caracter\u00edstica', 'descripci\u00f3n', 'description',
    'disponible', 'available', 'modelo', 'model', 'especificaciones',
    'specifications', 'specs', 'caracter\u00edsticas', 'detalles', 'details',
    'colores', 'colors', 'tallas', 'sizes', 'variants', 'variantes',
    'c\u00f3mo', 'how', 'd\u00f3nde', 'where', 'qu\u00e9', 'what', 'interesado',
    'interested', 'tienes', 'do you have', 'hay',
  ],
  order: [
    'pedido', 'order', 'compra', 'purchase', 'env\u00edo', 'shipping',
    'delivery', 'entrega', 'seguimiento', 'tracking', 'recibir', 'receive',
    'recibido', 'received', 'rastreo', 'track', 'direcci\u00f3n', 'address',
    'donde', 'where', 'llega', 'arrive', 'estado', 'status', 'cu\u00e1ndo',
    'when', 'llego', 'arrived', 'entregado', 'delivered',
  ],
  partnership: [
    'colaboraci\u00f3n', 'collaboration', 'partnership', 'asociaci\u00f3n',
    'social media', 'influencer', 'promotor', 'descuento', 'discount',
    'oferta', 'offer', 'promoci\u00f3n', 'promotion', 'comisi\u00f3n', 'commission',
    'contrato', 'contract', 'negocios', 'business', 'interesado',
  ],
}

export class Topic {
  private constructor(public readonly value: string) {}

  static detect(text: string): Topic {
    if (!text || typeof text !== 'string') {
      return new Topic('General')
    }

    const lowerText = text.toLowerCase()

    for (const [topic, keywords] of Object.entries(KEYWORD_MAP)) {
      if (keywords.some((kw) => lowerText.includes(kw))) {
        return new Topic(topic.charAt(0).toUpperCase() + topic.slice(1))
      }
    }

    return new Topic('General')
  }

  extractKeywords(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return []
    }

    const lowerText = text.toLowerCase()
    const topicLower = this.value.toLowerCase()
    const keywords = KEYWORD_MAP[topicLower] || []

    return keywords.filter((kw) => lowerText.includes(kw))
  }

  static getAvailableTopics(): string[] {
    return Object.keys(KEYWORD_MAP)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .concat(['General'])
  }
}
