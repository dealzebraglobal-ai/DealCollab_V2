import { readFile } from 'node:fs/promises';
import path from 'node:path';
import CartographyDashboard from './CartographyDashboard';

export const metadata = {
    title: 'Cartography Explorer | DealCollab AI',
    description: 'Developer-facing architecture explorer generated from DealCollab cartography JSON.',
};

async function readCartographyJson<T>(subPath: string, fallback: T): Promise<T> {
    try {
        const fullPath = path.join(process.cwd(), 'cartography', subPath);
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
        readCartographyJson('inventory/files.json', []),
        readCartographyJson('inventory/routes.json', []),
        readCartographyJson('inventory/tables.json', []),
        readCartographyJson('inventory/state-objects.json', []),
        readCartographyJson('inventory/env-vars.json', []),
        readCartographyJson('inventory/external-services.json', []),
        readCartographyJson('topology/import-graph.json', { nodes: [], edges: [], hub_score: {} }),
        readCartographyJson('topology/data-flows.json', []),
        readCartographyJson('topology/state-mutations.json', []),
        readCartographyJson('topology/module-decision-tree.json', { nodes: [], edges: [] }),
        readCartographyJson('topology/prompt-assembly.json', { order: [] }),
        readCartographyJson('narrative/why-cards.json', []),
        readCartographyJson('narrative/scar-registry.json', []),
        readCartographyJson('meta/staleness-report.json', {}),
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
