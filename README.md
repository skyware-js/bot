<div align="center">

<img src="https://raw.githubusercontent.com/skyware-js/.github/main/assets/logo-dark.png" height="72px" alt="Skyware" />

# @skyware/bot

</div>

A framework for building bots on Bluesky.

[Documentation](https://skyware.js.org/docs/bot)

## Features

- **Events**: Receive and respond to events in real time with zero setup.
- **Rate Limiting**: Automatically handle rate limits and caching.
- **High-level API**: A simple, high-level API designed for ease of use.

## Installation

```sh
npm install @skyware/bot
```

## Example Usage

```js
import { Bot } from "@skyware/bot";

const bot = new Bot();
await bot.login({ identifier: "···", password: "···" });

bot.on("reply", async (post) => {
    await post.reply({ text: "Thanks for replying to my post!" });
    await post.like();
    await post.author.follow();
})

```
