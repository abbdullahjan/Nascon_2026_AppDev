'use strict';

const db               = require('../config/db');
const checkoutService  = require('../services/checkoutService');
const inventoryService = require('../services/inventoryService');
const { sendError, AppError } = require('../utils/errors');

/**
 * /api/v1/products routes
 * Exposes store catalogue, product variants, inventory, and checkout operations.
 */
async function productsRoutes(fastify) {
  // GET /api/v1/products — list merchandise catalogue
  fastify.get('/products', async (request, reply) => {
    const { tenant_id } = request.query || {};

    let query = db('products').select('*');
    if (tenant_id) query = query.where({ tenant_id });

    const products = await query;
    const productIds = products.map(p => p.product_id);

    let variants = [];
    if (productIds.length > 0) {
      variants = await db('product_variants').whereIn('product_id', productIds);
    }

    const variantsByProd = {};
    for (const v of variants) {
      if (!variantsByProd[v.product_id]) variantsByProd[v.product_id] = [];
      variantsByProd[v.product_id].push({
        variant_id:  v.variant_id,
        sku:         v.sku,
        size:        v.size,
        color:       v.color,
        price_minor: v.price_minor,
        currency:    v.currency || 'PKR',
        stock:       v.stock,
        reserved:    v.reserved ?? 0,
      });
    }

    const result = products.map(p => {
      let meta = {};
      try {
        meta = typeof p.meta === 'string' ? JSON.parse(p.meta) : (p.meta || {});
      } catch (e) {
        meta = {};
      }
      return {
        product_id: p.product_id,
        tenant_id:  p.tenant_id,
        name:       p.name,
        meta: {
          category:    meta.category || 'Apparel',
          description: meta.description || 'Official Team Merchandise',
          image_url:   meta.image_url || '',
          ...meta,
        },
        variants:   variantsByProd[p.product_id] || [],
        created_at: p.created_at,
      };
    });

    return reply.status(200).send({ products: result });
  });

  // GET /api/v1/products/:product_id — single product with all variants
  fastify.get('/products/:product_id', async (request, reply) => {
    const { product_id } = request.params;

    const prod = await db('products').where({ product_id }).first();
    if (!prod) {
      return sendError(reply, 404, 'PRODUCT_NOT_FOUND', `Product '${product_id}' not found.`, {});
    }

    const variants = await db('product_variants').where({ product_id });
    let meta = {};
    try {
      meta = typeof prod.meta === 'string' ? JSON.parse(prod.meta) : (prod.meta || {});
    } catch (e) {
      meta = {};
    }

    return reply.status(200).send({
      product: {
        product_id: prod.product_id,
        tenant_id:  prod.tenant_id,
        name:       prod.name,
        meta: {
          category:    meta.category || 'Apparel',
          description: meta.description || 'Official Team Merchandise',
          image_url:   meta.image_url || '',
          ...meta,
        },
        variants: variants.map(v => ({
          variant_id:  v.variant_id,
          sku:         v.sku,
          size:        v.size,
          color:       v.color,
          price_minor: v.price_minor,
          currency:    v.currency || 'PKR',
          stock:       v.stock,
          reserved:    v.reserved ?? 0,
        })),
        created_at: prod.created_at,
      },
    });
  });

  // GET /api/v1/inventory/:variant_id — stock check
  fastify.get('/inventory/:variant_id', async (request, reply) => {
    try {
      const { variant_id } = request.params;
      const result = await inventoryService.getInventory(variant_id);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  });

  // POST /api/v1/checkout — purchase merchandise
  fastify.post('/checkout', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await checkoutService.checkout(body);
      return reply.status(result._isReplay ? 200 : 201).send(result.data);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  });

  // GET /api/v1/orders/:order_id — order details & receipt
  fastify.get('/orders/:order_id', async (request, reply) => {
    const { order_id } = request.params;

    const order = await db('orders').where({ order_id }).first();
    if (!order) {
      return sendError(reply, 404, 'ORDER_NOT_FOUND', `Order '${order_id}' not found.`, {});
    }

    const items = await db('order_items').where({ order_id });

    return reply.status(200).send({
      order: {
        order_id:         order.order_id,
        customer_id:      order.customer_id,
        status:           order.status,
        subtotal_minor:   order.subtotal_minor,
        discount_minor:   order.discount_minor,
        total_minor:      order.total_minor,
        currency:         order.currency,
        items: items.map(it => ({
          variant_id:        it.variant_id,
          quantity:          it.quantity,
          unit_price_minor:  it.unit_price_minor,
        })),
        created_at:       order.created_at,
      },
    });
  });
}

module.exports = productsRoutes;
