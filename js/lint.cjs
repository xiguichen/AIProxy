// Lint script for main.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'main.js');

console.log('🔍 Linting main.js...\n');

try {
    const code = fs.readFileSync(FILE, 'utf-8');

    // Check for basic syntax issues
    const issues = [];

    // Check for unbalanced braces
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
        issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Check for unbalanced parentheses
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
        issues.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    }

    // Check for unbalanced brackets
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
        issues.push(`Unbalanced brackets: ${openBrackets} open, ${closeBrackets} close`);
    }

    // Check for common syntax patterns
    const patterns = [
        { regex: /;\s*;/g, name: 'Double semicolon' },
        { regex: /=\s*=/g, name: 'Double equals' },
        { regex: /\bundefined\b/g, name: 'undefined usage' },
    ];

    patterns.forEach(({ regex, name }) => {
        const matches = code.match(regex);
        if (matches && matches.length > 0) {
            // These might be legitimate, just warn
            console.log(`⚠️  Found ${matches.length} instances of "${name}"`);
        }
    });

    // Try to parse with Function constructor (basic syntax check)
    try {
        new Function(code);
        console.log('✅ Basic syntax check passed');
    } catch (e) {
        issues.push(`Syntax error: ${e.message}`);
    }

    // Check for async/await issues
    const asyncFunctions = (code.match(/async\s+\w+\s*\(/g) || []).length;
    const awaitUsages = (code.match(/\bawait\b/g) || []).length;
    console.log(`📊 async functions: ${asyncFunctions}, await usages: ${awaitUsages}`);

    // Check IIFE structure
    const iifeStart = code.includes('(function() {');
    const iifeEnd = code.includes('})();');
    if (iifeStart && iifeEnd) {
        console.log('✅ IIFE structure is correct');
    } else {
        issues.push('IIFE structure is broken');
    }

    if (issues.length > 0) {
        console.log('\n❌ Issues found:');
        issues.forEach(issue => console.log(`  - ${issue}`));
        process.exit(1);
    } else {
        console.log('\n✅ Linting passed!');
    }

} catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
}
