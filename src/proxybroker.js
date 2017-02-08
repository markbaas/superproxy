import ProxyLists from 'proxy-lists'
import request from 'request'
import url from 'url'
import rules from './rules.json'

require('events').EventEmitter.prototype._maxListeners = 1000

const settings = {
    maxConcurrentRequests: 100,
    minProxies: 10,
    timeout: 8000
}

const options = {
    anonymityLevels: null,
    protocols: ['http', 'https'],
    // countries: ['us'],
    // sourcesWhiteList: ['incloak']
};

export default class ProxyBroker {

    constructor(judge) {
        this.judge = judge
        this.concurrentRequests = 0
        this.proxyPool = []
        this.fastPool = []
        this.jailPool = []
        this.foundProxies = 0
        this.checkingQueue = []

        this.fetchProxies()

        setInterval(() => {
            console.log(`${this.fastPool.length}/${this.proxyPool.length}/${this.jailPool.length}/${this.checkingQueue.length}`)
            for (let i = 0; i < (settings.maxConcurrentRequests - this.concurrentRequests); i++) {
                this.checkProxyFromQueue()
            }
            // console.log(this.fastPool.map((p) => this.getProxyUrl(p)))
            // console.log(this.proxyPool.map((p) => this.getProxyUrl(p)))
        }, 5000);
        setInterval(() => {
            this.checkBannedProxies()
        }, 1000)
    }

    fetchProxies() {
        ProxyLists.getProxies(options)
            .on('data', this.checkProxies.bind(this))
            .on('error', (err) => {
                // console.log('proxylists', err)
            })
            .once('end', () => {
                console.log('done returning in 3600s')
                setTimeout(() => {
                    this.fetchProxies()
                }, 3600000)
            })
    }

    checkProxies(proxies) {
        // const total = this.checkingQueue.length + this.fastPool.length + this.proxyPool.length
        // if (total > 100000) {
        //     this.dereferenceProxylists()
        // }
        this.foundProxies += proxies.length
        proxies.forEach((proxy) => {
            const proxyUrl = this.getProxyUrl(proxy)
            if (this.proxyPool.indexOf(proxyUrl) == -1 && this.fastPool.indexOf(proxyUrl) == -1 && this.checkingQueue.indexOf(proxyUrl) == -1)
                this.checkingQueue.push(proxyUrl)

        })
    }

    checkResponse(targetUrl, proxy, err, resp, body) {
        const domainRules = rules[url.parse(targetUrl).host] || rules['default']
        // check error
        if (err) {
            return 'request error'
        }
        if (resp === undefined) {
            return 'response is undefined'
        }

        // check status code
        if (domainRules.statusCode.indexOf(resp.statusCode) == -1) {
            return 'no status code match'
        }

        // check body
        if (domainRules.body !== undefined && domainRules.body.length > 0) {
            const hasMatch = domainRules.body.map((p) => {
                if (body.match(p))
                    return true
            }).indexOf(true) != -1
            if (!hasMatch) {
                return 'no body match'
            }
        }

        this.maybeAddProxy(proxy, resp.elapsedTime)

        return true
    }

    makeRequest(targetUrl, proxy, query) {
        return new Promise((resolve, reject) => {
            this.concurrentRequests += 1
            request({
                qs: query,
                url: targetUrl,
                proxy,
                timeout: settings.timeout,
                time: true,
                agent: false
                // pool: {
                //     maxSockets: Infinity
                // }
            }, (err, resp, body) => {
                this.concurrentRequests -= 1
                const results = this.checkResponse(targetUrl, proxy, err, resp, body)
                if (results === true)
                    resolve(resp, body)
                else
                    reject(results)
            }).on('error', (err) => {
                this.concurrentRequests -= 1
                reject('general error')
            })
        })
    }

    checkProxyFromQueue() {
        if (this.concurrentRequests >= settings.maxConcurrentRequests) {
            return
        }
        const proxy = this.checkingQueue.shift()
        if (proxy === undefined)
            return

        this.makeRequest(this.judge, proxy).then(() => {}, (err) => { });
    }

    checkBannedProxies() {
        this.jailPool = this.jailPool.filter((elem) => {
            const now = new Date().getTime()
            if (now - elem.time < elem.banTime) {
                return true
            } else {
                const elapsedTime = 0 ? (elem.pool == 'fast') : undefined
                this.maybeAddProxy(elem.proxy, elapsedTime)
            }
        })
    }

    maybeAddProxy(proxy, elapsedTime) {
        const inProxyPool = this.proxyPool.indexOf(proxy) !== -1
        if (elapsedTime !== undefined) {
            const inFastPool = this.fastPool.indexOf(proxy) !== -1
            if (elapsedTime < 2500 && !inFastPool) {
                this.fastPool.push(proxy)
                if (inProxyPool)
                    this.proxyPool.splice(this.proxyPool.indexOf(proxy), 1)
            } else {
                if (inFastPool) {
                    this.fastPool.splice(this.fastPool.indexOf(proxy) , 1)
                }
                if (!inProxyPool)
                    this.proxyPool.push(proxy)
            }
        } else {
            if (!inProxyPool)
                this.proxyPool.push(proxy)
        }
    }

    getProxy() {
        let proxy
        let i
        if (this.fastPool.length > 20) {
            i = Math.floor(Math.random() * this.fastPool.length)
            proxy = this.fastPool[i]
        } else {
            i = Math.floor(Math.random() * this.proxyPool.length)
            proxy = this.proxyPool[i]
        }

        return proxy
    }

    banProxy(proxy, banTime, pool) {
        if (proxy === undefined)
            return

        banTime = banTime || 120000

        const proxyIdx = this.proxyPool.indexOf(proxy)
        const fastPoolIdx = this.fastPool.indexOf(proxy)
        const inProxyPool = proxyIdx !== -1
        const inFastPool = fastPoolIdx !== -1

        if (inProxyPool)
            this.proxyPool.splice(proxyIdx, 1)

        if (inFastPool) {
            this.fastPool.splice(fastPoolIdx, 1)
        }

        this.jailPool.push({ proxy, time: new Date().getTime(), banTime, pool })
    }

    getProxyUrl(proxy) {
        return `${proxy.protocols[0]}://${proxy.ipAddress}:${proxy.port}`
    }

    getPage(targetUrl, query, tries) {

        tries = tries || 0
        const proxy = this.getProxy();
        if (!proxy) {
            setTimeout(() => {
                console.log('no proxies found waiting 5s')
                this.getPage(targetUrl, query, tries)
            }, 5000)
        }

        console.log(`Getting ${targetUrl} (try ${tries + 1})`)

        return new Promise((resolve, reject) => {

            const retryPage = () => {
                this.banProxy(proxy)

                if (tries < 10) {
                    this.getPage(targetUrl, query, tries + 1).then((resp) => {
                        resolve(resp)
                    }, () => {
                        reject()
                    })
                } else {
                    reject()
                }
            }

            this.makeRequest(targetUrl, proxy, query).then((resp, body) => {
                resolve(resp)
            }, (err) => {
                console.error('bla', err)
                retryPage()
            })
        })
    }
}
