import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ChatSession } from './chat-session.schema';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true }) // Automatically add createdAt and updatedAt
export class Message {
  // No need for explicit _id, Mongoose adds it automatically

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: ChatSession.name })
  chatSessionId!: MongooseSchema.Types.ObjectId; // Reference to the parent session

  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  role!: 'user' | 'assistant' | 'system'; // Define expected roles

  @Prop({ required: true })
  content!: string;

  @Prop({ type: [String], default: [] }) // Array of file identifiers (e.g., paths or IDs)
  files: string[] = [];

  @Prop({ type: MongooseSchema.Types.Mixed }) // For storing arbitrary metadata
  metadata?: Record<string, any>;

  // timestamps: true adds createdAt and updatedAt automatically
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexing example (optional, adjust based on query patterns)
MessageSchema.index({ chatSessionId: 1, createdAt: -1 });
