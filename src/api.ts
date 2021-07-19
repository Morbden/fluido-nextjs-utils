import cookie from 'cookie'
import cors from 'cors'
import {
  app as FirebaseApp,
  auth as FirebaseAuth,
  database as FirebaseDatabase,
} from 'firebase-admin'
import { NextApiRequest, NextApiResponse } from 'next'

export interface AppResponse<T = any> extends NextApiResponse<T> {
  cookie(key: string, value: any, opt?: object): void
}

interface TypedMap<T = any> {
  [key: string]: T
}

export interface AppRequest<B = TypedMap> extends NextApiRequest {
  token?: string
  body: B
  claimsRef: FirebaseDatabase.Reference
  userRef: FirebaseDatabase.Reference
  user: FirebaseAuth.DecodedIdToken
  automation: boolean
  authenticated: boolean
  claims: TypedMap
}

export interface AppNext {
  (error?: Error): void
}

export interface AppHandler {
  (request: AppRequest, response: AppResponse, next?: AppNext):
    | void
    | any
    | Promise<void>
    | Promise<any>
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface MiddlewareWrapperType {
  (...router: AppHandler[]): (
    request: AppRequest,
    response: AppResponse,
  ) => Promise<void>
}

interface BlockRequestMethodType {
  (method: RequestMethod): AppHandler
}

interface LoadAutomationKeysClaimsType {
  /**
   * @param {string} permissionKeys must contain keys separated with ';'
   *
   * respecting the separator regexp ';\s*'
   */
  (permissionKeys: string): AppHandler
}

interface LoadFirebaseClaimsType {
  (firebase: FirebaseApp.App): AppHandler
}

export const MiddlewareWrapper: MiddlewareWrapperType =
  (...routes) =>
  async (request, response) => {
    response.cookie = (key, value, opt = {}) => {
      const cookieSerialize = cookie.serialize(key, value, {
        path: '/',
        ...opt,
      })

      response.setHeader('Set-Cookie', cookieSerialize)
    }

    await [cors()].concat(routes).reduce(
      (promise: Promise<any>, fn) =>
        promise.then(
          () =>
            new Promise((resolve, reject) => {
              fn(request, response, (result: any) => {
                if (result instanceof Error) {
                  return reject(result)
                }
                return resolve(result)
              })
            }),
        ),
      Promise.resolve(true),
    )
  }

export const verifyToken: AppHandler = (request, _, next) => {
  let token: string
  request.claims = {}

  if (
    request &&
    request.cookies &&
    request.cookies[process.env.JWT_COOKIE_KEY || 'x-token']
  ) {
    token = request.cookies[process.env.JWT_COOKIE_KEY || 'x-token']
  }
  if (!token && request && request.headers && request.headers['x-token']) {
    token = request.headers['x-token'] as string
  }
  if (!token && request && request.query && request.query['token']) {
    token = request.query['token'] as string
  }

  if (!token) {
    let authParam: string = (request.headers['authorization'] ||
      request.headers['Authorization']) as string
    if (/^bearer .*$/i.test(authParam)) {
      token = authParam.split(' ')[1]
    }
  }

  if (token) {
    request.token = token
  }
  next()
}

export const blockRequestMethod: BlockRequestMethodType =
  (method = 'GET') =>
  (req, res, next) => {
    if (req.method !== method) {
      res.setHeader('Allow', [method])
      res.status(405).end('Method Not Allowed')
    } else {
      next()
    }
  }

export const loadAutomationKeysClaims: LoadAutomationKeysClaimsType =
  (permissionKeys) => (request, _, next) => {
    if (request.token && !request.authenticated) {
      request.automation = false
      request.authenticated = false
      if (permissionKeys.split(/;\s*/).includes(request.token)) {
        request.automation = true
        request.authenticated = true
      }
      next()
    } else {
      next()
    }
  }

export const loadFirebaseClaims: LoadFirebaseClaimsType =
  (firebase) => (request, _, next) => {
    if (request.token && !request.authenticated) {
      request.automation = false
      request.authenticated = false
      firebase
        .auth()
        .verifyIdToken(request.token)
        .then(async (user) => {
          request.authenticated = !!user
          request.user = user
          request.userRef = firebase.database().ref(`users/${user.uid}`)
          request.claimsRef = request.userRef.child('claims')
          request.claims = (await request.claimsRef.once('value')).val() || {}
          next()
        })
        .catch(() => next())
    } else {
      next()
    }
  }
