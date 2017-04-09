module.exports = function(RED) {
    'use strict';
    let dockerClient = require('dockerode')

    // Our shared configuration/connection to a docker engine instance
    function DockerEngine(n) {
        RED.nodes.createNode(this, n);

        // Our configuration and things
        let node = this;
        node.host = n.host;
        node.port = n.port;

        node.getClient = function() {
            return new dockerClient({
                host: node.host,
                port: node.port
            })
        }
    }
    RED.nodes.registerType("docker-engine", DockerEngine);

    // Input node for engine events
    function DockerEvents(n) {
        RED.nodes.createNode(this, n)

        this.engine = RED.nodes.getNode(n.engine)
        this.client = this.engine.getClient()

        this.client.getEvents({}, (err, events) => {
            if (err) {
                this.error('Error during client.getEvents()', err)
                this.status({fill: 'red', shape: 'ring', text: 'error'})
                return
            }
            this.status({fill: 'green', shape: 'dot', text: 'node-red:common.status.connected'})

            events.on('data', (chunk) => {
                let event = {}
                try {
                    event = JSON.parse(chunk.toString())
                } catch(e) {
                    this.error('Error parsing JSON in chunk.', e)
                    return
                }

                this.send({
                    _msgid: RED.util.generateId(),
                    type: event.Type,
                    action: event.Action,
                    time: event.time,
                    timeNano: event.timeNano,
                    payload: event
                })
            })

            events.on('close', function() {
                this.status({fill: 'red', shape: 'ring', text: 'node-red:common.status.disconnected'})
                this.warn('Docker event stream closed.')
            })

            events.on('error', (err) => {
                this.status({fill: 'red', shape: 'ring', text: 'node-red:common.status.disconnected'})
                this.error('Error:', err)
            })

            events.on('end', () => {
                this.status({fill: 'yellow', shape: 'ring', text: 'stream ended'})
                this.warn('Docker event stream ended.')
            })
        })
    }

    RED.nodes.registerType('docker-events', DockerEvents)

    // Simple node to send list of images when requested
    function DockerImages(n) {
        RED.nodes.createNode(this,n)
        this.engine = RED.nodes.getNode(n.engine)

        this.on('input', () => {
            let client = this.engine.getClient()
            client.listImages()
                .then(i => this.send({images: i}))
                .catch(err => this.error(err))
        })
    }
    RED.nodes.registerType('docker-images', DockerImages)

    // Node to manage a running container
    function DockerContainerAction(n) {
        RED.nodes.createNode(this, n)

        // A configuration!
        this.engine = RED.nodes.getNode(n.engine)
        this.config = {}
        this.config.action = n.action || undefined
        this.config.container = n.container

        this.on('input', (msg) => {
            let client = this.engine.getClient()
            let cid = this.config.container || msg.container || undefined
            let action = this.config.action || msg.action || undefined

            if (cid === undefined) {
                this.error("Container id/name must be provided via configuration or via `msg.container`")
                return
            }

            let container = client.getContainer(cid)

            switch (action) {
                case 'start':
                    container.start()
                        .then(res => {
                            delete msg.container
                            delete msg.action
                            msg.payload = res
                            this.send(msg)
                        }).catch(err => {
                            if (err.statusCode === 304) {
                                this.warn(`Unable to start container "${cid}", container is already started.`)
                                this.send(msg)
                            } else {
                                this.error(`Error starting container:  [${err.statusCode}] ${err.reason}`)
                                return
                            }
                        })
                    break
                case 'stop':
                    container.stop()
                        .then(res => {
                            delete msg.container
                            delete msg.action
                            msg.payload = res
                            this.send(msg)
                        }).catch(err => {
                            if (err.statusCode === 304) {
                                this.warn(`Unable to stop container "${cid}", container is already stopped.`)
                                this.send(msg)
                            } else {
                                this.error(`Error stopping container: [${err.statusCode}] ${err.reason}`)
                                return
                            }
                        })
                    break
                default:
                    this.error(`Called with an unknown action: ${action}`)
                    return
            }
        })
    }
    RED.nodes.registerType('docker-container-action', DockerContainerAction)
}

