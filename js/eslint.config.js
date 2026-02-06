export default [
    {
        ignores: ["node_modules/", "*.min.js"]
    },
    {
        languageOptions: {
            globals: {
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                WebSocket: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                MutationObserver: "readonly",
                Event: "readonly",
                MouseEvent: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "warn",
            "semi": ["error", "always"],
            "quotes": ["error", "single"]
        }
    }
];
