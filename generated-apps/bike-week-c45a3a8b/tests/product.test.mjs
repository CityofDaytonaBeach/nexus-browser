import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const contract = JSON.parse(readFileSync(new URL('../.nexus/product-contract.json', import.meta.url), 'utf8'));

assert.equal(contract.product, 'Daytona Bike Week landing page');
assert.match(source, /Daytona Bike Week/);
assert.match(source, /Reserve pass/);
assert.match(source, /Main Street Bike Show/);
assert.ok(contract.workflows.some((workflow) => workflow.name === 'Reserve a rally pass'));
assert.ok(contract.workflows.every((workflow) => workflow.steps.some((step) => step.action.startsWith('expect'))));

console.log('Product contract and Bike Week UI smoke checks passed.');
