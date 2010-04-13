var http = require('http'),
    sys = require('sys'),
    balance = require('../lib/balance');

var b = new balance.Balancer();
b.addListener("route", function (request) {
  request.setRoute(5984, 'couchdb.pythonesque.org')
})

var server = b.getServer();
server.listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/")