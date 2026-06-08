const fs = require('fs');
let content = fs.readFileSync('c:/Users/Nova/OneDrive/Documents/GitHub/Dealcollab/src/lib/promptRouter.ts', 'utf8');

const regex = /const (M4_[A-Z_]+) = `\n([\s\S]*?)\n`\.trim\(\);/g;

content = content.replace(regex, (match, name, body) => {
    if (name === 'M4_MANUFACTURING') return match;
    
    if (!body.includes('STRICT SKIP RULE:')) {
        body = body.replace('Each bullet on a new line.', 'Each bullet on a new line.\n\nSTRICT SKIP RULE: If a field is already in # FIELDS ALREADY PROVIDED, do NOT include the bullet for it. Skip it entirely.');
    }
    
    const lines = body.split('\n');
    const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('\\n•') || trimmed.startsWith('•')) {
            if (!line.includes('[SKIP if known]')) {
                if (!line.includes('[key:')) {
                    const words = trimmed.replace(/\\n•|•/g, '').replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
                    const keyName = words.slice(0, 2).join('_') || 'detail';
                    return line + ` [key: ${keyName}] [SKIP if known]`;
                } else {
                    return line + ' [SKIP if known]';
                }
            }
        }
        return line;
    });
    
    return `const ${name} = \`\n${newLines.join('\n')}\n\`.trim();`;
});

const shellRegex = /export const (M4_SHELL) = `\n([\s\S]*?)\n`\.trim\(\);/g;
content = content.replace(shellRegex, (match, name, body) => {
    if (!body.includes('STRICT SKIP RULE:')) {
        body = body.replace('Ask ALL of these:', 'Ask ALL of these:\n\nSTRICT SKIP RULE: If a field is already in # FIELDS ALREADY PROVIDED, do NOT include the bullet for it. Skip it entirely.');
    }
    const lines = body.split('\n');
    const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('\\n•') || trimmed.startsWith('•')) {
            if (!line.includes('[SKIP if known]')) {
                if (!line.includes('[key:')) {
                    const words = trimmed.replace(/\\n•|•/g, '').replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
                    const keyName = words.slice(0, 2).join('_') || 'detail';
                    return line + ` [key: ${keyName}] [SKIP if known]`;
                } else {
                    return line + ' [SKIP if known]';
                }
            }
        }
        return line;
    });
    
    return `export const ${name} = \`\n${newLines.join('\n')}\n\`.trim();`;
});

fs.writeFileSync('c:/Users/Nova/OneDrive/Documents/GitHub/Dealcollab/src/lib/promptRouter.ts', content);
console.log('Done!');
