# PathSmith

PathSmith is a small desktop app I am building for myself.

Right now it is focused on two things:

- sorting photos and videos into a cleaner structure
- cleaning empty folders left behind after duplicate cleanup or manual pruning

More tools can be added later, but only if they solve a real recurring problem on my machine.

## Stack

- `Tauri 2`
- `React`
- `TypeScript`
- `Vite`
- `Rust`

## Local development

### Prerequisites

- `Node.js 24.14+ LTS`
- `npm 11`
- `Rust stable`

### Install dependencies

```bash
npm install
```

### Run the desktop app in development

```bash
npm run tauri:dev
```

### Run the frontend only

```bash
npm run dev
```

### Build the app

```bash
npm run tauri:build
```

## Translations

PathSmith loads translations from JSON files in `src/locales/`.

- Each file name becomes the language label shown in the app
- `English.json` and `Italian.json` are included by default
- To add another language, drop a new JSON file into `src/locales/` and rebuild

Example:

```text
src/locales/French.json
```

After the next build, `French` will appear automatically in the language selector.

## License

MIT. The software is provided `AS IS`, without warranty.
