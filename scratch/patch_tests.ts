import fs from 'fs';
import path from 'path';

const testDir = path.join(__dirname, 'src/lib/__tests__');

function patchFile(filePath: string) {
    let content = fs.readFileSync(filePath, 'utf-8');

    // 1. In Candidate objects, add inferred_buyer_type, advisor_name, contact_phone if they are missing
    // Since this is hard to do with regex, we can find instances of `created_at:` which is usually at the end of Candidate mock.
    content = content.replace(/(\s+)(created_at:\s*new Date\(\)\.toISOString\(\),)/g, (match, p1, p2) => {
        return `${p1}inferred_buyer_type: null,${p1}advisor_name: null,${p1}contact_phone: null,${match}`;
    });
    
    // Also missing buyer_type in some
    content = content.replace(/(\s+)(inferred_buyer_type:\s*null,)/g, (match, p1, p2) => {
        // If buyer_type is not in the object, maybe we can't do this easily.
        // Wait, some have buyer_type, some don't.
        return match;
    });

    // 2. 'metadata' does not exist in Candidate in matchmakingPipelineEndToEnd.test.ts
    content = content.replace(/metadata: \{[^}]*\},\n/g, '');
    
    fs.writeFileSync(filePath, content, 'utf-8');
}

const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));
for (const file of files) {
    patchFile(path.join(testDir, file));
}
