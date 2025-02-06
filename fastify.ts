import "dotenv/config";
import Fastify, { type FastifyRequest } from 'fastify';
import { logger, meter, tracer } from './tracing'; // Ensure OpenTelemetry is initialized
import axios from 'axios';
import type { Span } from "@opentelemetry/api";

const httpRequestCounter = meter.createCounter("fastify.server.requests", {
    description: "Total number of HTTP requests received.",
    unit: "{requests}",
});

const activeRequestUpDownCounter = meter.createUpDownCounter("fastify.server.active_requests", {
  description: "Number of in-flight requests",
  unit: "{requests}"
})

const requestDurHistogram = meter.createHistogram("fastify.client.request.duration", {
  description: "The duration of an outgoing HTTP request.",
  unit: "ms",
})

const fastify = Fastify({ logger: true });

declare module 'fastify' {
  interface FastifyRequest {
    span: Span
  }
}

// Middleware to create spans manually for each request
fastify.addHook('onRequest', async (request, reply) => {
  const span = tracer.startSpan(`HTTP ${request.method} ${request.url}`);
  span.setAttribute('http.method', request.method);
  span.setAttribute('http.url', request.url);
  span.setAttribute('http.headers', JSON.stringify(request.headers));
  request.span = span;
});

fastify.addHook('onResponse', async (request, reply) => {
  if (request.span) {
    request.span.setAttribute('http.status_code', reply.statusCode);
    request.span.end();
  }
});

fastify.get('/', async (request, reply) => {
  httpRequestCounter.add(1);
  activeRequestUpDownCounter.add(1);
  try {
    const time = Math.random() * 100;
    await new Promise(resolve => setTimeout(resolve, time));
    if(Math.random() > 0.9) {
      throw new Error("FFF");
    }
    activeRequestUpDownCounter.add(-1);
    return reply.code(200).send({ message: Math.random() * 10 });
  } catch (error) {
    activeRequestUpDownCounter.add(-1);
    if(error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(400);
  }
});

interface DataRequest {
  data: string;
}

// Create the route with the schema validation
fastify.post<{ Body: DataRequest }>('/data', {
  schema: {
    body: {
      type: 'object',
      required: ['data'],
      properties: {
        data: { type: 'string' },
      },
    },
  },
}, async (request, reply) => {
  httpRequestCounter.add(1);
  if(request.body instanceof Object && Object.hasOwn(request.body, "data")) {
    return reply.code(200).send({message: request.body.data});
  }
  return reply.code(200).send({message: "No Data"});
})

fastify.get('/delay', async (request, reply) => {
  const start = performance.now();
  httpRequestCounter.add(1);
  activeRequestUpDownCounter.add(1);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  reply.send("hello");
  activeRequestUpDownCounter.add(-1);
  requestDurHistogram.record(performance.now() - start, { method: 'GET', status: 200 });
})

interface LogRequest {
  msg: string;
  data: any;
}

fastify.post<{ Body: LogRequest }>('/log', {
  schema: {
    body: {
      type: 'object',
      required: ['data'],
      properties: {
        msg: { type: 'string' },
        data: { type: 'object' },
      },
    },
  },
}, async (request, reply) => {
  logger.emit({
    severityNumber: 14,
    body: `Log ${request.body?.msg}`,
    attributes: request.body.data,
  });
  reply.send("OK");
})

fastify.get('/fetch', async (request, reply) => {
  const start = performance.now();
  try {
    request.span.addEvent('/fetch', {
      url: 'https://jsonplaceholder.typicode.com/todos/1'
    });
    const response = await axios.get('https://jsonplaceholder.typicode.com/todos/1');
    return response.data;
  } finally {
    requestDurHistogram.record(performance.now() - start, { method: 'GET', status: 200 });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();