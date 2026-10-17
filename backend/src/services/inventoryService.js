'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');

async function getInventory(variant_id) {
  const variant = await db('product_variants').where({ variant_id }).first();
  if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', `Variant '${variant_id}' not found.`, { variant_id });

  return {
    variant_id,
    stock:    variant.stock,
    reserved: variant.reserved ?? 0,
  };
}

module.exports = { getInventory };
