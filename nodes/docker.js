module.exports = function(RED) {
    'use strict';
    let dockerode = require('dockerode');

    function DockerEvents(config) {
        RED.nodes.createNode(this, config)

        let client = new dockerode({
            host: config.host,
            port: config.port
        })

        // opts can filter since, until, or various filters
        let eventWatchOpts = {

        }
        client.getEvents(eventWatchOpts, (err, events) => {
            if (err) {
                this.error('Error during client.getEvents()', err)
                this.status({fill:'red',shape:'ring',text:'error'})
                return
            }
            this.status({fill:'green',shape:'dot',text:'connected'})

            events.on('data', (chunk) => {
                let event
                try {
                    event = JSON.parse(chunk.toString())
                } catch(e) {
                    this.error('Error parsing JSON in chunk.', e)
                    return
                }
                this.status({fill:'green',shape:'dot',text:'handling'})

                let msg = {
                    _msgid: RED.util.generateId(),
                    type: event.Type,
                    action: event.Action,
                    time: event.time,
                    timeNano: event.timeNano,
                    payload: event
                }
                this.send(msg)
            })

            events.on('close', function() {
                this.status({fill:'red',shape:'ring',text:'disconnected'});
                this.warn('event stream closed')
            })

            events.on('error', (error) => {
                this.error('Error:', error)
            })

            events.on('end', () => {
                this.status({fill:'yellow',shape:'ring',text:'stream ended'});
                this.warn('Docker event stream ended.')
            })
        })
    }

    RED.nodes.registerType('docker', DockerEvents);
}

