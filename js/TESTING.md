# AIProxy Frontend Testing Guide

## 概述
AIProxy 前端使用 Jest 进行单元测试。所有测试文件位于 `js/src/tests/` 目录下。

## 快速开始

### 运行所有测试
```bash
python3 test-js.py
```

### 运行特定测试文件
```bash
python3 test-js.py config.test.js
```

### 运行 Jest 命令（需要先 cd 进入 js 目录）
```bash
cd js
npm test                # 运行所有测试
npm run test:watch    # 监听模式运行（文件变更时自动重新运行）
npm run test:coverage # 生成覆盖率报告
```

## 测试文件结构

```
js/src/tests/
├── config.test.js           # 配置模块测试
├── utils.test.js            # 工具函数测试
├── websocketManager.test.js # WebSocket 管理器测试
├── domManager.test.js       # DOM 操作管理器测试
└── aiChatForwarder.test.js  # 主转发器逻辑测试
```

## 设置步骤

### 1. 安装依赖
首次运行时会自动安装，或手动安装：
```bash
cd js
npm install
```

### 2. 编写测试
在 `js/src/tests/` 中创建 `.test.js` 文件，使用 Jest 语法：
```javascript
import { myFunction } from '../modules/myModule.js';

describe('myFunction', () => {
    test('should work correctly', () => {
        expect(myFunction()).toBe(true);
    });
});
```

### 3. 运行测试
```bash
python3 test-js.py
```

## 测试配置

### package.json
- 配置 Jest 测试环境（jsdom 用于浏览器 API 模拟）
- 配置 Babel 转换 ES6 模块语法
- 定义测试脚本

### .babelrc
- 配置 Babel 使用 @babel/preset-env 进行 ES6 转换

## 常见问题

### Q: "Jest 未安装" 错误
A: 运行 `python3 test-js.py` 会自动安装，或手动运行 `cd js && npm install`

### Q: "Cannot find module" 错误
A: 确保模块路径正确。jest 配置中的 `moduleNameMapper` 会自动映射模块引用。

### Q: 测试中访问浏览器 API（如 document、window）
A: Jest 已配置 `testEnvironment: jsdom`，提供浏览器 API 模拟

## 最佳实践

1. **编辑源代码后**：修改 `js/src/modules/` 中的文件后，运行测试验证
2. **提交前测试**：在 Git 提交前确保所有测试通过
3. **覆盖率检查**：定期运行 `npm run test:coverage` 检查代码覆盖率
4. **监听模式开发**：开发时使用 `npm run test:watch` 获得快速反馈

## 相关命令速查表

| 命令 | 说明 |
|------|------|
| `python3 test-js.py` | 运行所有 JS 测试（推荐） |
| `cd js && npm test` | 直接运行 Jest |
| `cd js && npm run test:watch` | 监听模式（开发推荐） |
| `cd js && npm run test:coverage` | 生成覆盖率报告 |
| `python3 build-main.py` | 构建生产 main.js |
