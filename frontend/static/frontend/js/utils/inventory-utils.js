export function collectSupplyItems(rows) {
    return [...rows].map((row) => ({
        fish_size: row.querySelector('.row-size').value,
        quantity: Number(row.querySelector('.row-qty').value) || 0,
        weight: Number(row.querySelector('.row-weight').value) || 0,
        rate: Number(row.querySelector('.row-rate').value) || 0,
    })).filter((item) => item.fish_size && item.quantity > 0 && item.weight > 0 && item.rate > 0);
}

export function supplyTotals(rows) {
    return [...rows].reduce((totals, row) => ({
        quantity: totals.quantity + (Number(row.querySelector('.row-qty').value) || 0),
        weight: totals.weight + (Number(row.querySelector('.row-weight').value) || 0),
        amount: totals.amount + (Number(row.querySelector('.row-amount').textContent) || 0),
    }), { quantity: 0, weight: 0, amount: 0 });
}
