"""
OrderFlow — PySpark Structured Streaming
==========================================
Reads order events from data/stream_inbox/ (JSON files written by events/producer.py).
No Kafka required — works with any JVM on PATH.

Computes 1-minute tumbling window event counts per topic.
Writes:  data/streaming/        (parquet, append mode)
         data/streaming_ckpt/   (Spark checkpoint)

Run:
    python analytics/spark_streaming.py
"""
import os

ROOT       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_JDK = os.path.join(os.path.expanduser("~"), "jdk21", "jdk-21.0.5+11")
_HADOOP = os.path.join(os.path.expanduser("~"), "hadoop")
if os.path.isdir(_JDK):
    os.environ.setdefault("JAVA_HOME", _JDK)
if os.path.isdir(_HADOOP):
    os.environ.setdefault("HADOOP_HOME", _HADOOP)
INBOX      = os.path.join(ROOT, "data", "stream_inbox")
OUTPUT     = os.path.join(ROOT, "data", "streaming")
CHECKPOINT = os.path.join(ROOT, "data", "streaming_ckpt")


def run() -> None:
    from pyspark.sql import SparkSession
    from pyspark.sql import functions as F
    from pyspark.sql.types import StringType, StructField, StructType

    os.makedirs(INBOX, exist_ok=True)
    os.makedirs(OUTPUT, exist_ok=True)
    os.makedirs(CHECKPOINT, exist_ok=True)

    spark = (
        SparkSession.builder
        .appName("OrderFlow-FileStreaming")
        .config("spark.sql.shuffle.partitions", "4")
        .config("spark.driver.memory", "512m")
        .config("spark.ui.enabled", "false")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    EVENT_SCHEMA = StructType([
        StructField("topic",      StringType(), True),
        StructField("order_id",   StringType(), True),
        StructField("event_time", StringType(), True),
        StructField("item",       StringType(), True),
        StructField("worker_id",  StringType(), True),
        StructField("error",      StringType(), True),
    ])

    raw = (
        spark.readStream
        .format("json")
        .schema(EVENT_SCHEMA)
        .option("maxFilesPerTrigger", 200)
        .load(INBOX)
    )

    events = raw.withColumn(
        "event_ts",
        F.coalesce(
            F.to_timestamp("event_time", "yyyy-MM-dd'T'HH:mm:ss.SSSSSS"),
            F.to_timestamp("event_time", "yyyy-MM-dd'T'HH:mm:ss"),
        )
    )

    windowed = (
        events
        .withWatermark("event_ts", "2 minutes")
        .groupBy(
            F.window("event_ts", "1 minute").alias("w"),
            F.col("topic"),
        )
        .agg(F.count("*").alias("count"))
        .select(
            F.col("w.start").alias("window_start"),
            F.col("w.end").alias("window_end"),
            "topic",
            "count",
        )
    )

    query = (
        windowed.writeStream
        .outputMode("append")
        .format("parquet")
        .option("path", OUTPUT)
        .option("checkpointLocation", CHECKPOINT)
        .trigger(processingTime="15 seconds")
        .start()
    )

    print(f"[spark_streaming] source : {INBOX}")
    print(f"[spark_streaming] output : {OUTPUT}")
    print("[spark_streaming] 1-min windows — Ctrl+C to stop")
    query.awaitTermination()


if __name__ == "__main__":
    run()
