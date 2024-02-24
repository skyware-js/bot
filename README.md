<p align="center">
	<img src="https://github.com/skyware-js/.github/blob/main/assets/logo-dark.png?raw=true" height="72">
</p>
<h1 align="center">@skyware/bot</h1>

A framework for building bots on Bluesky.

## Features

- **Events**: Receive and respond to events in real time with zero setup.
- **Rate Limiting**: Automatically handle rate limits and caching.
- **High-level API**: A simple, high-level API for building bots.

## Installation

```sh
npm install @skyware/bot
```

## Usage
*(Documentation coming soon)*

```js
import { Bot } from "@skyware/bot";

const bot = new Bot();
await bot.login({ identifier: "···", password: "···" });

bot.on("reply", async (post) => {
    post.reply("Thanks for replying to my post!");
    await post.like();
    await post.author.follow();
})

```

**Events:** `reply`, `quote`, `mention`, `repost`, `like`, `follow`, `open`, `close`, `error`.
