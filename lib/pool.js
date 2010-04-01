var http = require('http');

function createPool (options) {
  var pool = options || {};
  pool.groups = {};
  
  pool.createClient = function (port, host, group) {
    var client = http.createClient(port, host);
    var _request = client.request;
    client.request = function () {
      client.pending_requests += 0;
      var request = _request.apply(this, arguments);
      request.addListener("response", function (response) {
        client.response_received = true;
        response.addListener("end", function () {
          client.pending_requests -= 1;
        })
      });
      return request;
    }
    client.addListener("error", function (error) {
      group.removeClient(client);
    })
    return client;
  }
  
  pool.lock = function (client) {
    client.busy = true;
    client.pending_request = 0;
    client.locktime = Date();
    client.response_received = false;
  }
  pool.unlock = function (client) {
    delete client.response_received;
    delete client.endtime;
    delete client.starttime;
    client.unlockedAt = 
    client.busy = false;
  }
  
  pool.createGroup = function (port, host) {
    var group = { locked:false, 
                  pendingLimit: options.pendingLimit || 10, 
                  limit:false, 
                  clients:[],
                }
    group.getClient = function () {
      var clients = group.clients;
      for (var i=0;i<clients.length;i+=1) {
        if (!clients[i].busy) {
          pool.lock(clients[i]);
          return clients[i];
        }
      }
      if (limit && limit < clients.length) {
        return {error:"Over limit"};
      }
      var client = pool.createClient(port, host, group);
      group.clients.push(client);
      return client;
    };
    group.removeClient = function (client) {
      try {client.close()} catch ( ) {}
      group.clients.splice(group.clients.indexOf(client), 1);
    };
  }
  
  pool.getGroup = function (port, host) {
    if (pool.groups[host+":"+port]) {
      return pool.groups[host+":"+port];
    } else {
      pool.groups[host+":"+port] = pool.createGroup(post, host);
    }
  }
  
  pool.cleanup = function (client) {
    // return true or false if a client should be removed from the group
  }
}


