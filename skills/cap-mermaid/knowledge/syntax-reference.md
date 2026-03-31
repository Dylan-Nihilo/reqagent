## Mermaid 语法速查

### Flowchart

```
graph TD
    A[矩形] --> B(圆角矩形)
    B --> C{菱形判断}
    C -->|是| D[结果A]
    C -->|否| E[结果B]
```

方向: TD (上到下), LR (左到右), BT (下到上), RL (右到左)

连接: `-->` 实线箭头, `---` 实线, `-.->` 虚线箭头, `==>` 粗箭头

### Sequence Diagram

```
sequenceDiagram
    participant U as 用户
    participant S as 服务端
    U->>S: 请求
    S-->>U: 响应
    Note over U,S: 说明文字
```

箭头: `->>` 实线箭头, `-->>` 虚线箭头, `-x` 丢失消息

### Class Diagram

```
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    Animal <|-- Dog
```

关系: `<|--` 继承, `*--` 组合, `o--` 聚合, `-->` 关联

### State Diagram

```
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: 开始
    Processing --> Done: 完成
    Done --> [*]
```

### ER Diagram

```
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
```

关系: `||--||` 一对一, `||--o{` 一对多, `}o--o{` 多对多

### Gantt

```
gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 阶段一
    任务A :a1, 2024-01-01, 30d
    任务B :after a1, 20d
```
