import { roundMoney, roundQuantity } from './rounding.js';

export interface MovingAverageParams {
  existing_quantity: number;
  existing_average_cost: number;
  incoming_quantity: number;
  incoming_unit_cost: number;
}

export interface MovingAverageResult {
  new_quantity: number;
  new_average_cost: number;
}

/**
 * Calculates new inventory moving average cost for incoming stock:
 * (existing_qty * existing_cost + incoming_qty * incoming_cost) / (existing_qty + incoming_qty)
 */
export function calculateMovingAverageCost(params: MovingAverageParams): MovingAverageResult {
  const {
    existing_quantity,
    existing_average_cost,
    incoming_quantity,
    incoming_unit_cost,
  } = params;

  const validIncomingQty = Math.max(0, incoming_quantity);
  const validIncomingCost = Math.max(0, incoming_unit_cost);
  const validExistingQty = Math.max(0, existing_quantity);
  const validExistingCost = Math.max(0, existing_average_cost);

  const totalQty = roundQuantity(validExistingQty + validIncomingQty);

  if (totalQty <= 0) {
    return {
      new_quantity: 0,
      new_average_cost: 0,
    };
  }

  // If there was 0 existing stock, the new average is simply the incoming cost
  if (validExistingQty <= 0) {
    return {
      new_quantity: totalQty,
      new_average_cost: roundMoney(validIncomingCost),
    };
  }

  const existingTotalValue = validExistingQty * validExistingCost;
  const incomingTotalValue = validIncomingQty * validIncomingCost;
  const newAverageCost = roundMoney((existingTotalValue + incomingTotalValue) / totalQty);

  return {
    new_quantity: totalQty,
    new_average_cost: newAverageCost,
  };
}
