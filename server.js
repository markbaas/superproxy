
import express from 'express'
import request from 'request'
import argv from 'argv'

import ProxyBroker from './proxybroker'

process.env.UV_THREADPOOL_SIZE = 1024;


var args = argv.option({
    name: 'judge',
    short: 'j',
    type: 'string',
    description: 'Which host should be targeted for checking valid proxies?',
}).run()

const proxybroker = new ProxyBroker(args.options.judge)
const app = express()

app.use('/', (req, res) => {
    proxybroker.getPage(req.url).then((resp) => {
        res.set(resp.headers)
        res.status(resp.statusCode)
        res.send(resp.body)
        res.end()
    }, () => {
        res.status(408)
        res.end()
    })
});

const server = app.listen(8889, () => {
    const host = server.address().address
    const port = server.address().port

    console.log(`Listening at http://${host}:${port}`)
})