Static editor mock for build-step designs — locked scaffolding rows get the dashed rail + gutter lock + 72% text.

```jsx
<EditorFrame lines={[
  { locked: true, code: 'def greet(name):' },
  { code: '    return "Hi " + name + "!"', active: true },
]} />
```

disabled renders the EVALUATING dim. Production editors use design/trellis-editor-theme.ts.
