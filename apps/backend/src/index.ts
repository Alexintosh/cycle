import { createApp } from "./app.ts"

const { app, config } = await createApp()

app.listen({
  port: config.port,
  hostname: "localhost",
})

console.log(`🦊 Cycle API running at http://localhost:${config.port}`)
console.log(`📚 Swagger docs available at http://localhost:${config.port}/swagger`)
