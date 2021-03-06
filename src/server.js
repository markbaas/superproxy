#!/usr/bin/env node

import express from 'express'
import request from 'request'

import program from 'commander'

import ProxyBroker from './proxybroker'


process.env.UV_THREADPOOL_SIZE = 1024;

program
  .version('0.0.1')
  .option('-t, --target [target]', 'Target site [http://www.google.com]', 'http://www.google.com')
  .parse(process.argv);

console.log(`Starting proxybroker targeting ${program.target}`)
const proxybroker = new ProxyBroker(program.target)
const app = express()

app.use('/', (req, res, next) => {
  if (!req.url.match(/^\/api/)) {
    proxybroker.getPage(req.url).then((resp) => {
      res.set(resp.headers)
      res.status(resp.statusCode)
      res.send(resp.body)
      res.end()
    }, () => {
      res.status(408)
      res.end()
    })
  }
  next()
});

app.get('/api', (req, res) => {
    const url = req.headers['x-target-url']
    if (!url) {
        res.status(408)
        res.end()
    } else {
        proxybroker.getPage(url).then((resp) => {
            res.set(resp.headers)
            res.status(resp.statusCode)
            res.send(resp.body)
            res.end()
        }, () => {
            res.status(408)
            res.end()
        })
    }
})

process.on('uncaughtException', function (err) {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});

const server = app.listen(8889, () => {
    const host = server.address().address
    const port = server.address().port

    console.log(`Listening at http://${host}:${port}`)
})
