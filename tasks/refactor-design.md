# 重构设计文档

## 背景
当前的 `js/main.js` 是一个油猴脚本，包含了所有的逻辑代码。由于代码量较大且功能复杂，维护和测试变得困难。为了提高代码的可维护性和可测试性，需要对其进行模块化拆分，并支持单元测试。

## 重构目标
1. **模块化拆分**：将代码拆分为多个独立的模块文件，每个模块负责单一功能。
2. **单元测试支持**：为每个模块添加单元测试，确保功能的正确性。
3. **HTML 操作测试**：提供测试 HTML 模板，验证 JS 函数对 HTML 的操作是否符合预期。
4. **还原工具**：提供一个工具脚本，可以将拆分的模块重新合并为原始的 `main.js`。

## 拆分方案

### 模块划分
1. **配置模块**：
   - **文件名**：`config.js`
   - **职责**：包含所有的配置项，例如网站选择器、WebSocket 地址、超时设置等。

2. **工具函数模块**：
   - **文件名**：`utils.js`
   - **职责**：提供通用的工具函数，例如延迟函数、元素查找函数等。

3. **WebSocket 管理模块**：
   - **文件名**：`websocketManager.js`
   - **职责**：管理 WebSocket 的连接、消息发送与接收。

4. **DOM 操作模块**：
   - **文件名**：`domManager.js`
   - **职责**：负责 DOM 的操作，例如监听消息容器的变化、等待元素加载等。

5. **主逻辑模块**：
   - **文件名**：`aiChatForwarder.js`
   - **职责**：实现 `AIChatForwarder` 类的主要逻辑，包括初始化、消息处理等。

6. **入口文件**：
   - **文件名**：`main.js`
   - **职责**：加载所有模块并初始化 `AIChatForwarder`。

### 目录结构
```
js/src/
  ├── modules/
  │   ├── config.js
  │   ├── utils.js
  │   ├── websocketManager.js
  │   ├── domManager.js
  │   └── aiChatForwarder.js
  ├── tests/
  │   ├── config.test.js
  │   ├── utils.test.js
  │   ├── websocketManager.test.js
  │   ├── domManager.test.js
  │   └── aiChatForwarder.test.js
  ├── html/
  │   ├── test.html
  │   └── sample.html
  └── build.js
```

## 还原工具
- **文件名**：`build.js`
- **功能**：将 `modules/` 下的所有模块合并为一个文件 `main.js`，并添加油猴脚本头部注释。

## 测试方案
1. **单元测试**：
   - 使用 `Jest` 或其他测试框架为每个模块编写单元测试。
   - 测试内容包括函数的输入输出、异常处理等。

2. **HTML 操作测试**：
   - 提供测试 HTML 文件（如 `js/src/html/test.html`），模拟真实的 DOM 环境。
   - 使用测试 HTML 文件（如 `js/src/html/test.html`）。
   - 验证 JS 函数对 HTML 的操作是否符合预期。

## 测试详细说明

### 测试环境准备
1. **本地环境**：
   - 确保安装了 Node.js 和 npm。
   - 安装测试框架（如 Jest）：
     ```bash
     npm install --save-dev jest
     ```
   - 如果需要测试浏览器环境，安装 jsdom：
     ```bash
     npm install --save-dev jsdom
     ```

2. **浏览器环境**：
   - 使用测试 HTML 文件（如 `js/src/html/test.html`）。
   - 在浏览器中打开文件，观察控制台输出。

3. **跨平台测试**：
   - 在不同操作系统（Windows、macOS、Linux）上运行测试。
   - 使用不同的浏览器（Chrome、Firefox、Edge）验证功能。

### 测试步骤

#### 1. 单元测试
- **运行测试**：
  ```bash
  npx jest
  ```
- **测试内容**：
  - `config.js`：验证配置项是否正确加载。
  - `utils.js`：测试工具函数的输入输出是否符合预期。
  - `websocketManager.js`：
    - 测试 WebSocket 的连接、断开、消息发送与接收。
    - 模拟服务器响应，验证消息处理逻辑。
  - `domManager.js`：
    - 测试 DOM 操作函数是否能正确找到元素。
    - 验证 MutationObserver 是否能正确监听 DOM 变化。
  - `aiChatForwarder.js`：
    - 测试主逻辑的初始化流程。
    - 模拟用户交互，验证消息转发功能。

#### 2. HTML 操作测试
- **测试文件**：
  - 使用 `js/src/html/test.html`。
- **测试内容**：
  - 验证 JS 函数是否能正确操作 HTML 元素。
  - 模拟用户输入和按钮点击，观察页面行为是否符合预期。

#### 3. 浏览器兼容性测试
- **测试浏览器**：
  - Chrome 最新版
  - Firefox 最新版
  - Edge 最新版
- **测试内容**：
  - 验证脚本在不同浏览器中的行为是否一致。
  - 检查控制台是否有错误输出。

#### 4. 跨平台测试
- **测试操作系统**：
  - Windows 10/11
  - macOS Ventura
  - Ubuntu 22.04
- **测试内容**：
  - 验证脚本在不同操作系统中的行为是否一致。

### 测试报告
- **报告内容**：
  - 测试通过的模块和功能。
  - 测试失败的模块和错误详情。
  - 浏览器兼容性和跨平台测试结果。
- **生成报告**：
  - 使用 Jest 的内置功能生成测试报告：
    ```bash
    npx jest --coverage
    ```
  - 手动记录 HTML 操作测试和浏览器兼容性测试的结果。

---

以上为测试的详细说明，请根据实际需求调整测试内容。

## 实现步骤
1. 创建 `js/src/modules/` 目录，编写各模块代码。
2. 创建 `js/src/tests/` 目录，编写单元测试代码。
3. 创建 `js/src/html/` 目录，编写测试 HTML 文件。
4. 创建 `js/src/build.js`，实现模块合并逻辑。

## 注意事项
- 保留油猴脚本的头部注释，确保合并后的脚本可以直接使用。
- 模块化过程中，避免引入额外的依赖库。
- 确保所有模块的接口清晰，便于单元测试。

---

## 文件存放说明

### 文档目录
- `tasks/`：仅用于存放文档文件，例如 `refactor-design.md`。

### 代码目录
- `js/src/`：存放所有模块化的代码文件。
  - `js/src/modules/`：存放拆分后的模块代码。
  - `js/src/tests/`：存放单元测试代码。
  - `js/src/html/`：存放测试 HTML 文件。
  - `js/src/build.js`：模块合并工具。

### 更新后的目录结构
```
js/src/
  ├── modules/
  │   ├── config.js
  │   ├── utils.js
  │   ├── websocketManager.js
  │   ├── domManager.js
  │   └── aiChatForwarder.js
  ├── tests/
  │   ├── config.test.js
  │   ├── utils.test.js
  │   ├── websocketManager.test.js
  │   ├── domManager.test.js
  │   └── aiChatForwarder.test.js
  ├── html/
  │   ├── test.html
  │   └── sample.html
  └── build.js
```

---

请确保所有代码文件已移动到 `js/src/` 目录下，并更新相关路径引用。

