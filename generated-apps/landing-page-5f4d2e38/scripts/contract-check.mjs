import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync('.nexus/product-contract.json', 'utf8'));

if (contract.product !== 'Daytona Bike Week landing page') {
  throw new Error('Unexpected product contract name');
}

if (!Array.isArray(contract.workflows) || contract.workflows.length < 2) {
  throw new Error('Product contract must describe at least two landing-page workflows');
}

for (const workflow of contract.workflows) {
  const hasInteraction = workflow.steps.some((step) => ['click', 'fill', 'select', 'check'].includes(step.action));
  const hasOutcome = workflow.steps.some((step) => step.action.startsWith('expect'));
  if (!hasInteraction || !hasOutcome) {
    throw new Error(`Workflow ${workflow.name} needs both interaction and outcome assertion`);
  }
}

console.log('Product contract is valid.');
