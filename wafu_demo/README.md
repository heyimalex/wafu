# wafu_demo

Demo wafu site. Based heavily off the [Fuse site](https://fusejs.io/), it allows you to compare results of the wafu and Fuse by side with whatever options you like.

Unfortunately because of [spectre mitigations](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now), the numbers returned from `performance.now` are rounded by default to the nearest millisecond in firefox. You can stop this mitigation by setting `privacy.reduceTimerPrecision` to `false` in `about:config` if you want to see more accurate performance numbers, but obviously not recommended!

## TODO

- Make the collection modifiable.
- Make keys easier to use.
- Make it pretty :')
- Detect wasm support, display an error on failure?
- Display loading screen.
- Detect whether performance metrics are being rounded because of the issue above and hide them if they are.
