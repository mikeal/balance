var http = require('http'),
    sys = require('sys');

function createPool (options) {
  var pool = options || {};
  pool.groups = {};
  
  pool.createClient = function (port, host, group) {
    var client = http.createClient(port, host);
    client.lock = function () {pool.lock(client)};
    client.unlock = function () {pool.unlock(client)};
    client.group = group;
    var _request = client.request;
    client.request = function () {
      client.pending_requests += 0;
      var request = _request.apply(this, arguments);
      request.addListener("response", function (response) {
        client.response_received = true;
        response.addListener("end", function () {
          client.pending_requests -= 1;
          client.unlock();
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
    clearTimeout(client.cleanup);
  }
  pool.unlock = function (client) {
    delete client.response_received;
    delete client.endtime;
    delete client.starttime;
    client.destroy();
    client.unlockedAt = Date();
    client.busy = false;
    client.cleanup = setTimeout(function () {
      try {client.group.removeClient(client);} catch(err) {}
    }, 1000 * 60)
  }
  
  pool.createGroup = function (port, host) {
    var group = { locked:false, 
                  pendingLimit: pool.pendingLimit || 10, 
                  limit:false, 
                  clients:[],
                }
    group.getClient = function () {
      // var clients = group.clients;
      // for (var i=0;i<clients.length;i+=1) {
      //   if (!clients[i].busy) {
      //     clients[i].lock();
      //     return clients[i];
      //   }
      // }
      // if (group.limit && group.limit < clients.length) {
      //   return {error:"Over limit"};
      // }
      var client = pool.createClient(port, host, group);
      group.clients.push(client);
      return client;
    };
    group.removeClient = function (client) {
      try {client.end()} 
      catch(err){}
      group.clients.splice(group.clients.indexOf(client), 1);
    };
    return group;
  }
  
  pool.getGroup = function (port, host) {
    if (pool.groups[host+":"+port]) {
      return pool.groups[host+":"+port];
    } else {
      var group = pool.createGroup(port, host);
      pool.groups[host+":"+port] = group;
      return group;
    }
  }
  
  return pool;
}

exports.createPool = createPool;

