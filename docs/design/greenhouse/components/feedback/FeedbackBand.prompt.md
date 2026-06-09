Attribution feedback band — the product's heart. Icon disc + Baloo label; color+icon+label always travel together.

```jsx
<FeedbackBand attribution="misconception"
  misconceptionTitle="Glued text directly to a number — expected Python to auto-convert">
  That's the big one! Python will not secretly turn a number into text…
</FeedbackBand>
<FeedbackBand attribution="runtime" errorChip="ValueError · line 2" errorMessage="invalid literal for int() with base 10: 'Alan'" />
<FeedbackBand attribution="mismatch" reveal="Expected: HiAlan" />
```

pass = label only (one line, celebrate briefly). Never use a warning triangle; never style misconception as an error.
