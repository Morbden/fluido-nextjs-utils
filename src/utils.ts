import { fetchAPI } from '@fluido/react-utils'
import deepmerge from 'deepmerge'

interface NextStaticPropsReturn {
  props: { [key: string]: any }
  revalidate?: number
  notFound?: boolean
}

interface ComputeFunctionParams {
  params?: {
    [key: string]: any
  }
  preview?: boolean
  previewData?: any
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

interface ComputeFunction {
  (data: ComputeFunctionParams): any | Promise<any>
}

export const joinStaticProps = (...fns: ComputeFunction[]) => {
  let config = {}
  if (typeof fns[fns.length - 1] === 'object') {
    config = fns.pop()
  }
  return async (data: ComputeFunctionParams) => {
    try {
      const results = await Promise.all(fns.map((fn) => fn(data)))
      return {
        props: results.reduce((prev, cur) => deepmerge(prev, cur), {}),
        revalidate: 1,
        ...config,
      } as NextStaticPropsReturn
    } catch (err) {
      console.error(err)
      return {
        revalidate: 5,
        notFound: true,
        ...config,
      } as NextStaticPropsReturn
    }
  }
}

const deepField = (field: string, val: any) => {
  if (field.length < 1) throw new Error('invalid field name')
  const list = field.split('.')
  if (list.length === 1) return { [field]: val }

  const lastField = list.pop()

  return list.reverse().reduce(
    (prev, field) => {
      return { [field]: prev }
    },
    { [lastField]: val },
  )
}

type GetStaticFetchOptionsType = (data?: ComputeFunctionParams) => RequestInit

export const getStaticFetch = (
  name: string,
  uri: RequestInfo,
  opt?: GetStaticFetchOptionsType,
) => {
  return async (data: ComputeFunctionParams) => {
    const result = await fetchAPI(uri, opt ? opt(data) : null)
    if ('json' in result) {
      return deepField(name, result.json)
    } else {
      return deepField(name, result.text)
    }
  }
}

type GetStaticInternalFunctionType = (
  data: ComputeFunctionParams,
) => any | Promise<any>
export const getStaticInternal = (
  name: string,
  fn: GetStaticInternalFunctionType,
) => {
  return async (data: ComputeFunctionParams) =>
    deepField(name, await Promise.resolve(fn(data)))
}
