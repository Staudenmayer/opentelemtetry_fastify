import "dotenv/config";
import { logger, meter, tracer } from "./tracing"; // Ensure OpenTelemetry is initialized
import express from "express";
import axios from "axios";

const httpRequestCounter = meter.createCounter("express.server.requests", {
  description: "Total number of HTTP requests received.",
  unit: "{requests}",
});

const activeRequestUpDownCounter = meter.createUpDownCounter("express.server.active_requests", {
  description: "Number of in-flight requests",
  unit: "{requests}",
});

const requestDurHistogram = meter.createHistogram("express.client.requestx.duration", {
  description: "The duration of an outgoing HTTP request.",
  unit: "ms",
});

const app = express();
app.use(express.json());

app.get("/", async (req, res) => {
  httpRequestCounter.add(1);
  activeRequestUpDownCounter.add(1);
  try {
    const time = Math.random() * 100;
    await new Promise((resolve) => setTimeout(resolve, time));
    if (Math.random() > 0.9) {
      throw new Error("FFF");
    }
    activeRequestUpDownCounter.add(-1);
    return res.status(200).json({ message: Math.random() * 10 });
  } catch (error) {
    activeRequestUpDownCounter.add(-1);
    return res.status(400).json({ message: error.message });
  }
});

app.post("/data", (req, res) => {
  httpRequestCounter.add(1);
  if (req.body instanceof Object && Object.hasOwn(req.body, "data")) {
    return res.status(200).json({ message: req.body.data });
  }
  return res.status(200).json({ message: "No Data" });
});

app.get("/delay", async (req, res) => {
  const start = performance.now();
  httpRequestCounter.add(1);
  activeRequestUpDownCounter.add(1);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  res.send("hello");
  activeRequestUpDownCounter.add(-1);
  requestDurHistogram.record(performance.now() - start, { method: "GET", status: 200 });
});

app.post("/log", (req, res) => {
  logger.emit({
    severityNumber: 14,
    body: `Log ${req.body?.msg}`,
    attributes: req.body.data,
  });
  res.send("OK");
});

app.get("/fetch", async (req, res) => {
  const start = performance.now();
  try {
    const response = await axios.get("https://jsonplaceholder.typicode.com/todos/1");
    res.json(response.data);
  } finally {
    requestDurHistogram.record(performance.now() - start, { method: "GET", status: 200 });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
