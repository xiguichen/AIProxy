// 构建工具：将模块合并为一个文件
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

// Get absolute paths
const SCRIPT_DIR = path.dirname(path.resolve('js/src/build.js'));
const MODULES_DIR = path.join(SCRIPT_DIR, 'modules');
const OUTPUT_FILE = path.join(path.dirname(SCRIPT_DIR), 'main.js');
const HEADER = `// ==UserScript==
// @name         OpenAI API WebSocket Forwarder
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  将OpenAI API请求转发到网页AI服务的油猴脚本
// @author       Assistant
// @match        https://chat.openai.com/*
// @match        https://*.openai.com/*
// @match        https://claude.ai/*
// @match        https://yuanbao.tencent.com/*
// @match        https://arena.ai/*
// @grant        none
// @connect      localhost
// @connect      127.0.0.1
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @run-at       document-end
// ==/UserScript==\n\n`;

function build() {
    const files = ['config.js', 'utils.js', 'websocketManager.js', 'domManager.js', 'aiChatForwarder.js'];
    let combinedCode = HEADER;

    combinedCode += '(function() {\n    \'use strict\';\n\n'; // 开始自执行函数

    files.forEach(file => {
        const filePath = path.join(MODULES_DIR, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // 移除所有 import 语句（包括多行的）
        content = content.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/g, '');
        content = content.replace(/import\s+['"][^'"]+['"];?\s*/g, '');
        
        // 移除 export 关键字
        content = content.replace(/export\s+(const|function|class)\s+/g, '$1 ');
        content = content.replace(/export\s+\{[\s\S]*?\};?\s*/g, '');
        content = content.replace(/export\s+default\s+/g, '');
        
        combinedCode += `    // File: ${file}\n`;
        combinedCode += content.split('\n').map(line => '    ' + line).join('\n');
        combinedCode += '\n\n';
    });

    combinedCode += '})();\n'; // 结束自执行函数

    fs.writeFileSync(OUTPUT_FILE, combinedCode, 'utf-8');
    console.log('✅ 构建完成:', OUTPUT_FILE);

    // 运行 lint
    try {
        console.log('\n🔍 Running lint...');
        const lintResult = spawnSync('node', ['lint.cjs'], { 
            cwd: path.dirname(OUTPUT_FILE),
            encoding: 'utf-8'
        });
        console.log(lintResult.stdout);
        if (lintResult.stderr) {
            console.log(lintResult.stderr);
        }
        console.log('✅ Lint passed!');
    } catch (e) {
        console.error('❌ Lint failed!');
        process.exit(1);
    }
}

build();