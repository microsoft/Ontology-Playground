from __future__ import annotations

import asyncio
import importlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.neo4j_graphrag_config import get_neo4j_graphrag_config

TEXT = """[2026-04-01 08:15] 고객 CUST-102 (백진암)가 STR-22 (강남점) 매장에서 주문 ORD-5001을 생성함.

주문 ORD-5001은 제품 PROD-01 (시그니처 에스프레소) 2잔을 포함하며, "샷 추가" 옵션이 선택됨.

주문 ORD-5001의 총 결제 금액은 12,500원이며, 모바일 결제로 완료됨. 상태: 결제완료."""


async def main() -> None:
    llm_module = importlib.import_module("neo4j_graphrag.llm")
    extractor_module = importlib.import_module(
        "neo4j_graphrag.experimental.components.entity_relation_extractor"
    )
    schema_module = importlib.import_module(
        "neo4j_graphrag.experimental.components.schema"
    )
    types_module = importlib.import_module(
        "neo4j_graphrag.experimental.components.types"
    )

    OpenAILLM = getattr(llm_module, "OpenAILLM")
    LLMEntityRelationExtractor = getattr(
        extractor_module, "LLMEntityRelationExtractor"
    )
    OnError = getattr(extractor_module, "OnError")
    SchemaBuilder = getattr(schema_module, "SchemaBuilder")
    NodeType = getattr(schema_module, "NodeType")
    RelationshipType = getattr(schema_module, "RelationshipType")
    PropertyType = getattr(schema_module, "PropertyType")
    TextChunk = getattr(types_module, "TextChunk")
    TextChunks = getattr(types_module, "TextChunks")
    DocumentInfo = getattr(types_module, "DocumentInfo")

    cfg = get_neo4j_graphrag_config()
    llm = OpenAILLM(
        model_name=cfg.openai_model,
        model_params={"temperature": 0},
        api_key=cfg.openai_api_key,
    )
    try:
        schema = SchemaBuilder.create_schema_model(
            node_types=[
                NodeType(
                    label="Customer",
                    properties=[
                        PropertyType(name="customer_id", type="STRING"),
                        PropertyType(name="name", type="STRING"),
                    ],
                ),
                NodeType(
                    label="Store",
                    properties=[
                        PropertyType(name="store_id", type="STRING"),
                        PropertyType(name="name", type="STRING"),
                    ],
                ),
                NodeType(
                    label="Order",
                    properties=[PropertyType(name="order_id", type="STRING")],
                ),
                NodeType(
                    label="Product",
                    properties=[
                        PropertyType(name="product_id", type="STRING"),
                        PropertyType(name="name", type="STRING"),
                    ],
                ),
                NodeType(
                    label="Payment",
                    properties=[
                        PropertyType(name="amount", type="INTEGER"),
                        PropertyType(name="method", type="STRING"),
                        PropertyType(name="status", type="STRING"),
                    ],
                ),
            ],
            relationship_types=[
                RelationshipType(label="CREATED"),
                RelationshipType(label="PLACED_AT"),
                RelationshipType(label="CONTAINS"),
                RelationshipType(label="PAID_WITH"),
            ],
            patterns=[
                ("Customer", "CREATED", "Order"),
                ("Order", "PLACED_AT", "Store"),
                ("Order", "CONTAINS", "Product"),
                ("Order", "PAID_WITH", "Payment"),
            ],
        )

        chunks = TextChunks(chunks=[TextChunk(text=TEXT, index=0, uid="chunk_0001")])
        extractor = LLMEntityRelationExtractor(
            llm=llm,
            on_error=OnError.RAISE,
            create_lexical_graph=False,
            use_structured_output=llm.supports_structured_output,
        )
        graph = await extractor.run(
            chunks=chunks,
            document_info=DocumentInfo(path="probe.txt"),
            schema=schema,
        )
        print(json.dumps(graph.model_dump(), ensure_ascii=False, indent=2))
    finally:
        await llm.async_client.close()


if __name__ == "__main__":
    asyncio.run(main())
