Stacked, numbered hint ladder. Newest row animates in; earlier rows never move. Level-4 confirm is an inline sunken row, deliberately NOT a modal.

```jsx
<HintLadder hints={["Read the error…", "Text and numbers are different types…"]} />
<HintLadder hints={h13} actionLabel="Show full solution" />
<HintLadder hints={h13} confirming />
<HintLadder hints={h14} solution={'def announce(number):\n    return "Your random number is: " + str(number)'} />
```
