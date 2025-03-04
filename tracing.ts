import { Resource } from "@opentelemetry/resources";
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter }  from "@opentelemetry/exporter-trace-otlp-http";
import { LoggerProvider, SimpleLogRecordProcessor, ConsoleLogRecordExporter } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { metrics, trace, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

//diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);

if(!process.env.SERVICE_NAME) {
    process.exit();
}

const resource = Resource.default().merge(
    new Resource({
        [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: "0.1.0",
    }),
);

const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
});

const consoleMetricExporter = new ConsoleMetricExporter();
const consoleMetricReader = new PeriodicExportingMetricReader({
    exporter: consoleMetricExporter,
});

const traceExporter = new OTLPTraceExporter({});

const logExporter = new OTLPLogExporter({});
const consoleLogExporter = new ConsoleLogRecordExporter();
const loggerProvider = new LoggerProvider({ resource });

loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(logExporter));
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(consoleLogExporter));


const sdk = new NodeSDK({
    serviceName: process.env.SERVICE_NAME,
    resource,
    metricReader,
    traceExporter,
    instrumentations: [
        getNodeAutoInstrumentations(),
        new HttpInstrumentation(),
        new FastifyInstrumentation(),
        new ExpressInstrumentation()
    ]
});

process.on("beforeExit", async () => {
    await sdk.shutdown();
});

sdk.start();

export const logger = loggerProvider.getLogger(process.env.SERVICE_NAME);
export const meter = metrics.getMeter(process.env.SERVICE_NAME);
export const tracer = trace.getTracer(process.env.SERVICE_NAME);
//Metrics: https://betterstack.com/community/guides/observability/opentelemetry-metrics-nodejs/#step-8-sending-metrics-data-to-an-opentelemetry-backend