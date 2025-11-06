import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Server } from 'http'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})



const server = serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

process.on("SIGINT", () => {
    server.close()
    console.log("Closing");
    process.exit(0)
})

process.on('SIGTERM', () => {
  server.close((err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    process.exit(0)
  })
})
