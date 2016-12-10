# superproxy
Super proxy that rotates and throttles ip using a free proxy ip pool

Run with
```
babel-node --presets es2015,stage-2 server.js --judge=<targetsite>
```

Wait for the ip pool to fill up. The log will print out sorts of stuff among an entry with the format:
n/n/n/n => number of fast proxies/normal proxies/banned proxies/found proxies