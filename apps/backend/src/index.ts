import { createApp } from "./app.ts"

const { app, config } = await createApp()

app.listen({
  port: config.port,
  hostname: "127.0.0.1",
})

console.log(`🦊 Cycle API running at http://127.0.0.1:${config.port}`)
console.log(`📚 Swagger docs available at http://127.0.0.1:${config.port}/swagger`)
