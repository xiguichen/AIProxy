#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');

// 获取构建脚本路径
const buildScriptPath = path.resolve(__dirname, 'js/src/build.js');

// 执行构建脚本
exec(`node ${buildScriptPath}`, (error, stdout, stderr) => {
    if (error) {
        console.error(`❌ 构建失败: ${error.message}`);
        process.exit(1);
    }

    if (stderr) {
        console.error(`⚠️ 构建警告: ${stderr}`);
    }

    console.log(stdout);
    console.log('✅ 构建完成: main.js 已生成');
});