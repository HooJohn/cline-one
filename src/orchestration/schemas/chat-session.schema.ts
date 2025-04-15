import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Message } from './message.schema'; // Import Message for relation

export type ChatSessionDocument = ChatSession & Document;

@Schema({ timestamps: true })
export class ChatSession {
  // Mongoose adds _id automatically

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) // For storing arbitrary context data
  context?: Record<string, any>;

  @Prop({ required: false }) // Optional title for the chat session
  title?: string;

  // We don't embed messages directly for scalability.
  // Messages will reference ChatSession via chatSessionId.
  // We can add a virtual property if needed to fetch messages,
  // but typically fetching messages is done via a separate query in the service/repository.

  // timestamps: true adds createdAt and updatedAt automatically
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Indexing example
ChatSessionSchema.index({ userId: 1, updatedAt: -1 });

// Optional: Virtual property to populate messages (use with caution on large datasets)
/*
ChatSessionSchema.virtual('messages', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'chatSessionId',
  // options: { sort: { createdAt: 1 } } // Optional sorting
});

// Ensure virtuals are included when converting to JSON/object
ChatSessionSchema.set('toJSON', { virtuals: true });
ChatSessionSchema.set('toObject', { virtuals: true });
*/
