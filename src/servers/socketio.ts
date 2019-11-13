import { Server } from 'http'
import SocketIO from 'socket.io-client'

import time from '../utils/time'
import Book  from '../Book'
import Order from '../Order'
import { CandleAVL, CandleInterval } from '../Candle'

export default function createSocketIO (books: Map<string, Book>, candleTrees: Map<string, Map<CandleInterval, CandleAVL>>, app: any) {
  const http = require('http').Server(app)
  const io = SocketIO(http)

  const intervalCodes = new Map<string, CandleInterval>([
    ['1m', CandleInterval.ONE_MINUTE],
    ['1h', CandleInterval.ONE_HOUR],
    ['1d', CandleInterval.ONE_DAY],
  ])

  // const oldSettle = book.settle

  // book.settle = () => {
  //   const trades = oldSettle()

  //   // Emit Trades
  //   io.emit('trades.updated',    trades)
  //   io.emit('orderBook.updated', book.orderBook)
  //   io.emit('candles.updated',   [])

  //   return trades
  // }

  // const oldAddOrder = book.addOrder

  // book.addOrder = (o) => {
  //   return oldAddOrder(o)
  // }

  io.on('connection', (socket: any) => {
    console.log('user connected')
    // On connection we should check to see if the user has previous historical data
    // If they have client side data already we need to figure out any gaps they're missing and fill them
    // If they don't have client data we need to send them the historical payload

    socket.on('book.subscribe', (room: any) => {
      const { name } = room

      try {
        const book = books.get(name)
        if (!book) {
          throw new Error(`No book found for ${name}`)
        }

        socket.join(name)

        socket.emit('book.subscribe.success', { success: true, book: name })
      } catch (e) {

        socket.emit('book.subscribe.error', {
          error: e.message,
        })
      }
    })

    socket.on('book.unsubscribe', (room: any) => {
      const { name } = room

      try {
        socket.leave(name)

        socket.emit('book.unsubscribe.success', { success: true })
      } catch (e) {

        socket.emit('book.unsubscribe.error', {
          error: e.message,
        })
      }
    })

    socket.on('order.create', (order: any) => {
      const {
        externalId,
        side,
        type,
        quantity,
        price,
        name
      } = order

      try {
        const book = books.get(name)
        if (!book) {
          throw new Error(`Book ${book} not found`)
        }
        const o = new Order(externalId, side, type, quantity, price)
        book.addOrder(o)

        socket.emit('order.create.success', o)
      } catch (e) {

        socket.emit('order.create.error', {
          error: e.message,
        })
      }
    })

    // We should change this to be an interval that broadcasts every 10 seconds or so
    // That way the client knows to append the data
    socket.on('candles.get', (opts: any) => {
      let {
        endTime,
        startTime,
        interval,
        limit,
        name
      } = opts

      try {
        const cts = candleTrees.get(name)

        if (!cts) {
          throw new Error(`No candles found for ${name}`)
        }


        endTime = startTime || time().valueOf()
        // interval = interval || CandleInterval.Hour
        limit = Math.min(1000, limit)

        // TODO Add limit and time

        const ct = cts.get(intervalCodes.get(interval) as CandleInterval)
        if (!ct) {
          throw new Error(`Candle interval ${interval} for ${name} not found`)
        }
        const candles = ct.values().map((x) => x.export())
        socket.emit('candles.get.success', candles)
      } catch (e) {
        socket.emit('candles.get.error', {
          error: e.message,
        })
      }
    })

    socket.on('disconnect', () => {
      console.log('user disconnected')
    })

    // Setup broadcast interval
    setInterval(() => {
      // Iterate through each book and broadcast to each room
      books.forEach(b => {
        console.log(`Broadcasting ${b.name}`)
        socket.to(b.name).emit('book.data', b.orderBook)
      })
    }, 15 * 1000)
  })

  return http
}
