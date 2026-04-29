import { createApp } from "./app.ts"

const { app, config } = await createApp()
const host = "0.0.0.0"

app.listen({
  port: config.port,
  hostname: host,
})

console.log(`🦊 Cycle API running at http://${host}:${config.port}`)
console.log(`📚 Swagger docs available at http://${host}:${config.port}/swagger`)
