import { describe, it, expect } from 'vitest';
import { calculateMovingAverageCost } from '../moving-average-cost.js';

describe('calculateMovingAverageCost', () => {
  it('correctly sets initial cost when starting stock was 0', () => {
    const result = calculateMovingAverageCost({
      existing_quantity: 0,
      existing_average_cost: 0,
      incoming_quantity: 10,
      incoming_unit_cost: 45000,
    });

    expect(result.new_quantity).toBe(10);
    expect(result.new_average_cost).toBe(45000);
  });

  it('correctly computes weighted average cost with existing inventory', () => {
    // Existing: 10 units @ 50,000 = 500,000
    // Incoming: 20 units @ 60,000 = 1,200,000
    // Total: 30 units, Total value: 1,700,000 -> Average: 56,666.67
    const result = calculateMovingAverageCost({
      existing_quantity: 10,
      existing_average_cost: 50000,
      incoming_quantity: 20,
      incoming_unit_cost: 60000,
    });

    expect(result.new_quantity).toBe(30);
    expect(result.new_average_cost).toBe(56666.67);
  });
});
