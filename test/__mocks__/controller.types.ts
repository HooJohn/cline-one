import { Request, Response } from 'express';

export type MockRequest = Partial<Request> & {
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
};

export type MockResponse = Partial<Response> & {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
};

export const createMockRequest = (options: MockRequest = {}): MockRequest => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  ...options
});

export const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
  return res;
}; 