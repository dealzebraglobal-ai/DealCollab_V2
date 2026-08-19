import { readFile } from 'node:fs/promises';
import path from 'node:path';
import CartographyDashboard from './CartographyDashboard';

export const metadata = {
    title: 'Cartography Explorer | DealCollab AI',
    description: 'Developer-facing architecture explorer generated from DealCollab cartography JSON.',
};

async function readCartographyJson<T>(relativePath: string, fallback: T): Promise<T> {
    try {
        const fullPath = path.join(process.cwd(), relativePath);
        const file = await readFile(fullPath, 'utf8');
        return JSON.parse(file) as T;
    } catch {
        return fallback;
    }
}

export default async function CartographyPage() {
    const [
        files,
        routes,
        tables,
        stateObjects,
        envVars,
        externalServices,
        importGraph,
        dataFlows,
        stateMutations,
        moduleDecisionTree,
        promptAssembly,
        whyCards,
        scarRegistry,
        staleness,
    ] = await Promise.all([
        readCartographyJson('cartography/inventory/files.json', []),
        readCartographyJson('cartography/inventory/routes.json', []),
        readCartographyJson('cartography/inventory/tables.json', []),
        readCartographyJson('cartography/inventory/state-objects.json', []),
        readCartographyJson('cartography/inventory/env-vars.json', []),
        readCartographyJson('cartography/inventory/external-services.json', []),
        readCartographyJson('cartography/topology/import-graph.json', { nodes: [], edges: [], hub_score: {} }),
        readCartographyJson('cartography/topology/data-flows.json', []),
        readCartographyJson('cartography/topology/state-mutations.json', []),
        readCartographyJson('cartography/topology/module-decision-tree.json', { nodes: [], edges: [] }),
        readCartographyJson('cartography/topology/prompt-assembly.json', { order: [] }),
        readCartographyJson('cartography/narrative/why-cards.json', []),
        readCartographyJson('cartography/narrative/scar-registry.json', []),
        readCartographyJson('cartography/meta/staleness-report.json', {}),
    ]);

    return (
        <CartographyDashboard
            data={{
                files,
                routes,
                tables,
                stateObjects,
                envVars,
                externalServices,
                importGraph,
                dataFlows,
                stateMutations,
                moduleDecisionTree,
                promptAssembly,
                whyCards,
                scarRegistry,
                staleness,
            }}
        />
    );
}
